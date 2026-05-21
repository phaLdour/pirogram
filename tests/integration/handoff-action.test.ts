import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

const authMock = vi.fn().mockResolvedValue({ user: { id: "u-test", role: "ADMIN" } });
vi.mock("@/lib/auth", () => ({ auth: authMock }));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "aw.example.test", "x-forwarded-proto": "https" }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// We need to inspect the body GitHub would receive — vi.mock the createIssue
// helper so we can assert on its arguments.
const createIssueSpy = vi.fn();

import type * as GithubMod from "@/lib/github";
vi.mock("@/lib/github", async () => {
  const actual = await vi.importActual<typeof GithubMod>("@/lib/github");
  return {
    ...actual,
    createIssue: (...args: unknown[]) => createIssueSpy(...args),
  };
});

const accountMock = vi.fn();
vi.mock("@/lib/github-token", () => ({
  getGithubAccount: (...args: unknown[]) => accountMock(...args),
}));

const prisma = new PrismaClient();

beforeAll(() => {
  process.env.WEBHOOK_KEY_ENCRYPTION_KEY = "a".repeat(64);
});

beforeEach(async () => {
  authMock.mockResolvedValue({ user: { id: "u-test", role: "ADMIN" } });
  createIssueSpy.mockReset();
  createIssueSpy.mockResolvedValue({ number: 42, htmlUrl: "https://github.com/x/y/issues/42" });
  accountMock.mockReset();
  accountMock.mockResolvedValue({
    accessToken: "ghp_test",
    scope: "read:user user:email repo admin:repo_hook",
    providerAccountId: "1",
  });
  await prisma.$transaction([
    prisma.message.deleteMany(),
    prisma.task.deleteMany(),
    prisma.agent.deleteMany(),
    prisma.sprint.deleteMany(),
    prisma.eventLog.deleteMany(),
    prisma.repo.deleteMany(),
  ]);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function fd(record: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(record)) f.append(k, v);
  return f;
}

async function seed() {
  const repo = await prisma.repo.create({
    data: {
      fullName: "alice/foo",
      encryptedSecret: "stub",
      hint: "stub",
    },
  });
  const sprint = await prisma.sprint.create({
    data: { name: "Q3 Sprint", goal: "Add the quiz module", status: "ACTIVE" },
  });
  return { repo, sprint };
}

describe("handoffToClaudeCode", () => {
  it("opens an issue WITHOUT an @claude mention (anti-trigger guard)", async () => {
    const { repo, sprint } = await seed();
    const { handoffToClaudeCode } = await import("@/app/sprints/actions");

    const result = await handoffToClaudeCode(fd({ sprintId: sprint.id, repoId: repo.id }));
    expect(result.ok).toBe(true);

    expect(createIssueSpy).toHaveBeenCalledTimes(1);
    const [, fullName, body] = createIssueSpy.mock.calls[0] ?? [];
    expect(fullName).toBe("alice/foo");
    expect(body).toMatchObject({ labels: ["agentwatch-driven"] });
    // The critical guard: body must NOT contain `@claude` (else the Action
    // would trigger and burn tokens).
    expect(body.body).not.toContain("@claude");
    expect(body.body).toContain("hand-off from AgentWatch");
    expect(body.body).toContain("Add the quiz module");
  });

  it("persists driverMode = HANDOFF and driverStatus = REQUESTED", async () => {
    const { repo, sprint } = await seed();
    const { handoffToClaudeCode } = await import("@/app/sprints/actions");

    await handoffToClaudeCode(fd({ sprintId: sprint.id, repoId: repo.id }));

    const refreshed = await prisma.sprint.findUnique({ where: { id: sprint.id } });
    expect(refreshed?.driverMode).toBe("HANDOFF");
    expect(refreshed?.driverStatus).toBe("REQUESTED");
    expect(refreshed?.driverRepoId).toBe(repo.id);
    expect(refreshed?.driverIssueNumber).toBe(42);
  });

  it("returns a copy-pasteable prompt that references the issue number", async () => {
    const { repo, sprint } = await seed();
    const { handoffToClaudeCode } = await import("@/app/sprints/actions");

    const result = await handoffToClaudeCode(fd({ sprintId: sprint.id, repoId: repo.id }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error();
    expect(result.prompt).toContain("alice/foo");
    expect(result.prompt).toContain("Add the quiz module");
    expect(result.prompt).toContain("Closes #42");
    expect(result.deepLink.startsWith("https://claude.ai/new?q=")).toBe(true);
  });

  it("rejects when scope is insufficient", async () => {
    accountMock.mockResolvedValueOnce({
      accessToken: "ghp_test",
      scope: "read:user user:email",
      providerAccountId: "1",
    });
    const { repo, sprint } = await seed();
    const { handoffToClaudeCode } = await import("@/app/sprints/actions");

    const result = await handoffToClaudeCode(fd({ sprintId: sprint.id, repoId: repo.id }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("scope-insufficient");
    expect(createIssueSpy).not.toHaveBeenCalled();
  });

  it("rejects when sprint is already bound to an issue", async () => {
    const { repo, sprint } = await seed();
    await prisma.sprint.update({
      where: { id: sprint.id },
      data: { driverRepoId: repo.id, driverIssueNumber: 99 },
    });
    const { handoffToClaudeCode } = await import("@/app/sprints/actions");

    const result = await handoffToClaudeCode(fd({ sprintId: sprint.id, repoId: repo.id }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("already-driving");
  });
});
