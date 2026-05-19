import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

// The actions module guards on `auth()`. Mock it before the actions module
// is loaded so server-action calls succeed during integration tests.
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "u-test", role: "ADMIN", email: "t@t" } }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", async () => {
  return {
    redirect: vi.fn((url: string) => {
      throw new Error(`redirect:${url}`);
    }),
  };
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

async function loadActions() {
  return import("@/app/sprints/actions");
}

async function loadProjections() {
  return import("@/lib/projections");
}

function fd(record: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(record)) f.append(k, v);
  return f;
}

describe("sprint lifecycle (start → auto-attach → end → changelog)", () => {
  it("starts a sprint, auto-attaches new TaskCreated events, and produces a versioned changelog on end", async () => {
    const { startSprint, endSprint } = await loadActions();
    const { applyProjection } = await loadProjections();

    const startResult = await startSprint(fd({ name: "Q3-W1", goal: "ship MVP" }));
    expect(startResult.ok).toBe(true);
    const sprintId = startResult.ok ? startResult.id : "";
    expect(sprintId).not.toBe("");

    // Emit two events: one feature + one fix. Both should auto-attach to the
    // active sprint via the projection.
    await prisma.$transaction(async (tx) => {
      await applyProjection(tx, {
        type: "TaskCreated",
        eventId: "00000000-0000-4000-8000-000000000c01",
        at: "2026-05-19T19:00:00.000Z",
        task: { id: "T-A", title: "feat: live agents", assignee: "BE" },
      });
    });
    await prisma.$transaction(async (tx) => {
      await applyProjection(tx, {
        type: "TaskCreated",
        eventId: "00000000-0000-4000-8000-000000000c02",
        at: "2026-05-19T19:01:00.000Z",
        task: { id: "T-B", title: "fix: replay window", assignee: "BE" },
      });
    });

    const attached = await prisma.task.findMany({ where: { sprintId } });
    expect(attached).toHaveLength(2);

    // Complete both
    await prisma.task.updateMany({
      where: { sprintId },
      data: { status: "DONE", completedAt: new Date() },
    });

    const endResult = await endSprint(fd({ id: sprintId, bump: "auto" }));
    expect(endResult.ok).toBe(true);
    const version = endResult.ok ? endResult.version : "";
    // First sprint with a `feat:` task → minor bump from v0.1.0 → v0.2.0.
    expect(version).toBe("v0.2.0");

    const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
    expect(sprint?.status).toBe("COMPLETED");
    expect(sprint?.endedAt).not.toBeNull();
    expect(sprint?.changelog).toContain("## Features");
    expect(sprint?.changelog).toContain("live agents");
    expect(sprint?.changelog).toContain("## Fixes");
    expect(sprint?.changelog).toContain("replay window");
  });

  it("refuses to start a second active sprint", async () => {
    const { startSprint } = await loadActions();
    await startSprint(fd({ name: "first" }));
    const second = await startSprint(fd({ name: "second" }));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe("active-sprint-exists");
  });

  it("refuses to end a non-existent or already-completed sprint", async () => {
    const { startSprint, endSprint } = await loadActions();
    const r1 = await endSprint(fd({ id: "nope" }));
    expect(r1.ok).toBe(false);

    const started = await startSprint(fd({ name: "S" }));
    if (!started.ok) throw new Error("setup");
    const r2 = await endSprint(fd({ id: started.id, bump: "patch" }));
    expect(r2.ok).toBe(true);
    const r3 = await endSprint(fd({ id: started.id, bump: "patch" }));
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.error).toBe("not-active");
  });
});
