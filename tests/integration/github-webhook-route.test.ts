import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { encryptSecret, secretHint } from "@/lib/webhook/secret";

const SECRET = "ghs_integration_test_secret_aaaaaaaaaaaa";

beforeAll(() => {
  process.env.WEBHOOK_KEY_ENCRYPTION_KEY = "a".repeat(64);
});

const prisma = new PrismaClient();
const REPO_SLUG = "phaLdour/english4kids";
let repoId = "";

beforeEach(async () => {
  await prisma.$transaction([
    prisma.message.deleteMany(),
    prisma.task.deleteMany(),
    prisma.agent.deleteMany(),
    prisma.sprint.deleteMany(),
    prisma.eventLog.deleteMany(),
    prisma.repo.deleteMany(),
  ]);
  const repo = await prisma.repo.create({
    data: {
      fullName: REPO_SLUG,
      encryptedSecret: encryptSecret(SECRET),
      hint: secretHint(SECRET),
    },
  });
  repoId = repo.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

function sign(body: string, secret = SECRET) {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

async function callGithubWebhook(
  event: string,
  payload: unknown,
  opts: { deliveryId?: string; signature?: string } = {},
) {
  const mod = await import("@/app/api/webhook/github/route");
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-github-event": event,
    "x-github-delivery": opts.deliveryId ?? "22222222-2222-2222-2222-222222222222",
    "x-hub-signature-256": opts.signature ?? sign(body),
  };
  const req = new Request("http://localhost/api/webhook/github", {
    method: "POST",
    headers,
    body,
  });
  return mod.POST(req);
}

const PUSH_PAYLOAD = {
  ref: "refs/heads/main",
  repository: { full_name: REPO_SLUG },
  pusher: { name: "alice" },
  commits: [
    {
      id: "f00ba12345abcde",
      message: "feat: integration coverage",
      author: { username: "alice" },
      timestamp: "2026-05-20T12:00:00Z",
    },
  ],
};

describe("POST /api/webhook/github", () => {
  it("accepts a valid signed push, persists Message + TaskCreated tagged to the repo", async () => {
    const res = await callGithubWebhook("push", PUSH_PAYLOAD);
    expect(res.status).toBe(202);
    const json = (await res.json()) as { accepted: boolean; persisted: number };
    expect(json).toMatchObject({ accepted: true, persisted: 2 });

    const tasks = await prisma.task.findMany();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.repoId).toBe(repoId);
    expect(tasks[0]?.id).toBe(`${REPO_SLUG}/COMMIT-f00ba12`);
    const messages = await prisma.message.findMany();
    expect(messages).toHaveLength(1);
    expect(messages[0]?.repoId).toBe(repoId);
    expect(await prisma.eventLog.count()).toBe(2);
  });

  it("is idempotent on a redelivered X-GitHub-Delivery", async () => {
    await callGithubWebhook("push", PUSH_PAYLOAD, { deliveryId: "dup-1" });
    const res2 = await callGithubWebhook("push", PUSH_PAYLOAD, { deliveryId: "dup-1" });
    expect(res2.status).toBe(202);
    const json = (await res2.json()) as { duplicates: number; persisted: number };
    expect(json.duplicates).toBe(2);
    expect(json.persisted).toBe(0);
    expect(await prisma.eventLog.count()).toBe(2);
    expect(await prisma.task.count()).toBe(1);
  });

  it("rejects a tampered body with 401", async () => {
    const goodSig = sign(JSON.stringify(PUSH_PAYLOAD));
    const tampered = { ...PUSH_PAYLOAD, commits: [{ ...PUSH_PAYLOAD.commits[0], message: "evil" }] };
    const res = await callGithubWebhook("push", tampered, { signature: goodSig });
    expect(res.status).toBe(401);
    expect(await prisma.task.count()).toBe(0);
  });

  it("returns 404 when the repo is not bound", async () => {
    await prisma.repo.deleteMany();
    const res = await callGithubWebhook("push", PUSH_PAYLOAD);
    expect(res.status).toBe(404);
  });

  it("acks unsupported GitHub events with 202 and recognized=false", async () => {
    const payload = { repository: { full_name: REPO_SLUG } };
    const res = await callGithubWebhook("star", payload);
    expect(res.status).toBe(202);
    const json = (await res.json()) as { recognized: boolean };
    expect(json.recognized).toBe(false);
    expect(await prisma.eventLog.count()).toBe(0);
  });

  it("acks ping with 202 and 0 persisted", async () => {
    const payload = { zen: "Speak like a human.", repository: { full_name: REPO_SLUG } };
    const res = await callGithubWebhook("ping", payload);
    expect(res.status).toBe(202);
    const json = (await res.json()) as { persisted: number };
    expect(json.persisted).toBe(0);
  });

  it("returns 400 when X-GitHub-Event / signature / delivery headers are missing", async () => {
    const mod = await import("@/app/api/webhook/github/route");
    const req = new Request("http://localhost/api/webhook/github", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(PUSH_PAYLOAD),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
  });
});
