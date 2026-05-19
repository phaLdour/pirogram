import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const SECRET = "integration-test-secret";

// Set env BEFORE the route module imports run. The webhook handler reads
// process.env at request time, so this is safe to apply in beforeAll.
beforeAll(() => {
  process.env.WEBHOOK_SIGNING_SECRET = SECRET;
});

const prisma = new PrismaClient();

beforeEach(async () => {
  await prisma.$transaction([
    prisma.message.deleteMany(),
    prisma.task.deleteMany(),
    prisma.agent.deleteMany(),
    prisma.sprint.deleteMany(),
    prisma.eventLog.deleteMany(),
  ]);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function sign(body: string, secret = SECRET) {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

function unixSecs(): string {
  return String(Math.floor(Date.now() / 1000));
}

function makeRequest(body: string, headers: Record<string, string>): Request {
  return new Request("http://localhost/api/webhook/events", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

async function callWebhook(body: string, headers: Record<string, string>) {
  // Dynamic import so the env we set in beforeAll is in effect.
  const mod = await import("@/app/api/webhook/events/route");
  return mod.POST(makeRequest(body, headers));
}

const VALID_EVENT = {
  type: "TaskCreated" as const,
  eventId: "00000000-0000-4000-8000-000000000aaa",
  at: "2026-05-19T19:00:00.000Z",
  task: { id: "T-INT-1", title: "feat: integration coverage", assignee: "PM" },
};

describe("POST /api/webhook/events", () => {
  it("accepts a valid signed event, persists projections, and is idempotent", async () => {
    const body = JSON.stringify(VALID_EVENT);
    const headers = {
      "x-agentwatch-signature": sign(body),
      "x-agentwatch-timestamp": unixSecs(),
    };

    const res1 = await callWebhook(body, headers);
    expect(res1.status).toBe(202);
    const json1 = (await res1.json()) as { accepted: boolean; eventId: string; duplicate?: true };
    expect(json1).toMatchObject({ accepted: true, eventId: VALID_EVENT.eventId });
    expect(json1.duplicate).toBeUndefined();

    const persistedTask = await prisma.task.findUnique({ where: { id: "T-INT-1" } });
    expect(persistedTask?.title).toBe("feat: integration coverage");
    const persistedAgent = await prisma.agent.findUnique({ where: { name: "PM" } });
    expect(persistedAgent?.status).toBe("WORKING");
    const eventLog = await prisma.eventLog.count();
    expect(eventLog).toBe(1);

    // Replay the same eventId — must ACK idempotently with `duplicate:true`
    // and must NOT insert a second EventLog row.
    const res2 = await callWebhook(body, headers);
    expect(res2.status).toBe(202);
    const json2 = (await res2.json()) as { duplicate?: true };
    expect(json2.duplicate).toBe(true);
    expect(await prisma.eventLog.count()).toBe(1);
  });

  it("rejects a tampered body with 401", async () => {
    const goodBody = JSON.stringify(VALID_EVENT);
    const ts = unixSecs();
    const signature = sign(goodBody);
    const tampered = JSON.stringify({
      ...VALID_EVENT,
      task: { ...VALID_EVENT.task, title: "evil" },
    });

    const res = await callWebhook(tampered, {
      "x-agentwatch-signature": signature,
      "x-agentwatch-timestamp": ts,
    });
    expect(res.status).toBe(401);
    expect(await prisma.task.count()).toBe(0);
    expect(await prisma.eventLog.count()).toBe(0);
  });

  it("rejects a stale timestamp with 401", async () => {
    const body = JSON.stringify(VALID_EVENT);
    const stale = String(Math.floor(Date.now() / 1000) - 60 * 60);
    const res = await callWebhook(body, {
      "x-agentwatch-signature": sign(body),
      "x-agentwatch-timestamp": stale,
    });
    expect(res.status).toBe(401);
    const reason = (await res.json()) as { reason?: string };
    expect(reason.reason).toBe("stale");
  });

  it("rejects malformed JSON after passing signature with 400", async () => {
    const body = "not-json{";
    const res = await callWebhook(body, {
      "x-agentwatch-signature": sign(body),
      "x-agentwatch-timestamp": unixSecs(),
    });
    expect(res.status).toBe(400);
  });

  it("rejects schema-invalid payload with 422", async () => {
    const body = JSON.stringify({ type: "Unknown", eventId: "x", at: "z" });
    const res = await callWebhook(body, {
      "x-agentwatch-signature": sign(body),
      "x-agentwatch-timestamp": unixSecs(),
    });
    expect(res.status).toBe(422);
  });

  it("returns 500 when no signing secret is configured", async () => {
    const original = process.env.WEBHOOK_SIGNING_SECRET;
    const originalEnc = process.env.WEBHOOK_KEY_ENCRYPTION_KEY;
    delete process.env.WEBHOOK_SIGNING_SECRET;
    delete process.env.WEBHOOK_KEY_ENCRYPTION_KEY;
    try {
      const body = JSON.stringify(VALID_EVENT);
      const res = await callWebhook(body, {
        "x-agentwatch-signature": sign(body, "anything"),
        "x-agentwatch-timestamp": unixSecs(),
      });
      expect(res.status).toBe(500);
    } finally {
      if (original !== undefined) process.env.WEBHOOK_SIGNING_SECRET = original;
      if (originalEnc !== undefined) process.env.WEBHOOK_KEY_ENCRYPTION_KEY = originalEnc;
    }
  });
});
