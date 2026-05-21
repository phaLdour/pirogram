import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

// Authenticated by default; flip per-call when we need unauthorized paths.
const authMock = vi.fn().mockResolvedValue({ user: { id: "u-test", role: "ADMIN" } });
vi.mock("@/lib/auth", () => ({ auth: authMock }));

// Pretend the request came from this host so payloadUrl() can build a URL.
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "aw.example.test",
      "x-forwarded-proto": "https",
    }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const installSpy = vi.fn();
const deleteSpy = vi.fn();
import type * as GithubMod from "@/lib/github";

vi.mock("@/lib/github", async () => {
  const actual = await vi.importActual<typeof GithubMod>("@/lib/github");
  return {
    ...actual,
    installRepoWebhook: (...args: unknown[]) => installSpy(...args),
    deleteRepoWebhook: (...args: unknown[]) => deleteSpy(...args),
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
  installSpy.mockReset();
  deleteSpy.mockReset();
  accountMock.mockReset();
  accountMock.mockResolvedValue({
    accessToken: "ghp_test_token",
    scope: "read:user user:email repo admin:repo_hook",
    providerAccountId: "12345",
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

describe("bindRepo", () => {
  it("calls GitHub install + persists Repo with githubHookId + returns one-time secret", async () => {
    installSpy.mockResolvedValue({ id: 555, alreadyExisted: false });
    const { bindRepo } = await import("@/app/repos/actions");
    const result = await bindRepo(fd({ fullName: "alice/foo" }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error();
    expect(result.autoInstalled).toBe(true);
    expect(result.alreadyExisted).toBe(false);
    expect(result.secret).toMatch(/^[0-9a-f]{64}$/);

    expect(installSpy).toHaveBeenCalledWith(
      "ghp_test_token",
      "alice/foo",
      "https://aw.example.test/api/webhook/github",
      result.secret,
    );

    const repo = await prisma.repo.findUnique({ where: { fullName: "alice/foo" } });
    expect(repo?.githubHookId).toBe(555);
    expect(repo?.installedBy).toBe("u-test");
    expect(repo?.revokedAt).toBeNull();
  });

  it("returns scope-insufficient when account lacks the needed scopes", async () => {
    accountMock.mockResolvedValueOnce({
      accessToken: "tok",
      scope: "read:user user:email",
      providerAccountId: "1",
    });
    const { bindRepo } = await import("@/app/repos/actions");
    const result = await bindRepo(fd({ fullName: "alice/foo" }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    expect(result.error).toBe("scope-insufficient");
  });

  it("rejects invalid fullName format", async () => {
    const { bindRepo } = await import("@/app/repos/actions");
    const r = await bindRepo(fd({ fullName: "not a slug" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("fullname-invalid");
  });

  it("returns github-* when the API call fails", async () => {
    installSpy.mockRejectedValue(
      Object.assign(new Error("Bad creds"), {
        name: "GitHubApiError",
        kind: "unauthorized",
        status: 401,
      }),
    );
    // Make sure error has the right shape for instanceof check
    const { GitHubApiError } = await import("@/lib/github");
    installSpy.mockRejectedValueOnce(new GitHubApiError("unauthorized", 401, "Bad creds"));

    const { bindRepo } = await import("@/app/repos/actions");
    const r = await bindRepo(fd({ fullName: "alice/foo" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("github-unauthorized");
    // No Repo row was created.
    expect(await prisma.repo.count()).toBe(0);
  });

  it("returns encryption-misconfigured (no 500) when the master key is missing", async () => {
    const prior = process.env.WEBHOOK_KEY_ENCRYPTION_KEY;
    delete process.env.WEBHOOK_KEY_ENCRYPTION_KEY;
    try {
      const { bindRepo } = await import("@/app/repos/actions");
      const r = await bindRepo(fd({ fullName: "alice/foo" }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("encryption-misconfigured");
    } finally {
      if (prior !== undefined) process.env.WEBHOOK_KEY_ENCRYPTION_KEY = prior;
    }
  });
});

describe("unbindRepo", () => {
  it("deletes the GitHub-side hook and marks the Repo revoked", async () => {
    const created = await prisma.repo.create({
      data: {
        fullName: "alice/foo",
        encryptedSecret: "stub",
        hint: "stub",
        githubHookId: 999,
        installedBy: "u-test",
      },
    });
    deleteSpy.mockResolvedValue(undefined);
    const { unbindRepo } = await import("@/app/repos/actions");
    const r = await unbindRepo(fd({ id: created.id }));
    expect(r.ok).toBe(true);
    expect(deleteSpy).toHaveBeenCalledWith("ghp_test_token", "alice/foo", 999);
    const after = await prisma.repo.findUnique({ where: { id: created.id } });
    expect(after?.revokedAt).not.toBeNull();
  });

  it("still revokes locally when GitHub delete fails", async () => {
    const created = await prisma.repo.create({
      data: {
        fullName: "alice/bar",
        encryptedSecret: "stub",
        hint: "stub",
        githubHookId: 42,
        installedBy: "u-test",
      },
    });
    deleteSpy.mockRejectedValue(new Error("network blip"));
    const { unbindRepo } = await import("@/app/repos/actions");
    const r = await unbindRepo(fd({ id: created.id }));
    expect(r.ok).toBe(true);
    const after = await prisma.repo.findUnique({ where: { id: created.id } });
    expect(after?.revokedAt).not.toBeNull();
  });

  it("returns not-found for unknown id", async () => {
    const { unbindRepo } = await import("@/app/repos/actions");
    const r = await unbindRepo(fd({ id: "no-such" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("not-found");
  });
});

describe("bindManually", () => {
  it("creates a Repo without calling GitHub", async () => {
    const { bindManually } = await import("@/app/repos/actions");
    const r = await bindManually(fd({ fullName: "alice/baz", displayName: "Baz" }));
    expect(r.ok).toBe(true);
    expect(installSpy).not.toHaveBeenCalled();
    const repo = await prisma.repo.findUnique({ where: { fullName: "alice/baz" } });
    expect(repo?.githubHookId).toBeNull();
    expect(repo?.displayName).toBe("Baz");
  });
});
