import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { AgentEvent } from "@/lib/webhook/schema";
import { applyProjection } from "@/lib/projections";

const prisma = new PrismaClient();

const baseId = "00000000-0000-4000-8000-000000000000";

function evt<T extends AgentEvent["type"]>(
  type: T,
  rest: Omit<Extract<AgentEvent, { type: T }>, "type" | "eventId" | "at">,
  at: string,
  suffix = "1",
): AgentEvent {
  return {
    type,
    eventId: baseId.slice(0, -1) + suffix,
    at,
    ...(rest as object),
  } as AgentEvent;
}

beforeEach(async () => {
  await prisma.$transaction([
    prisma.activity.deleteMany(),
    prisma.message.deleteMany(),
    prisma.task.deleteMany(),
    prisma.agent.deleteMany(),
    prisma.eventLog.deleteMany(),
  ]);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("applyProjection · Activity events", () => {
  it("creates a parent Task activity then a nested child, and tracks currentActivityId", async () => {
    await prisma.$transaction(async (tx) => {
      await applyProjection(
        tx,
        evt(
          "ActivityStarted",
          {
            agent: "PM",
            toolUseId: "toolu_parent",
            toolName: "Task",
            subagentType: "Explore",
            description: "Survey the codebase",
          },
          "2026-05-21T12:00:00.000Z",
          "1",
        ),
      );
      await applyProjection(
        tx,
        evt(
          "ActivityStarted",
          {
            agent: "PM",
            toolUseId: "toolu_child",
            toolName: "Grep",
            parentToolUseId: "toolu_parent",
          },
          "2026-05-21T12:00:01.000Z",
          "2",
        ),
      );
    });

    const all = await prisma.activity.findMany({ orderBy: { startedAt: "asc" } });
    expect(all).toHaveLength(2);
    const [parent, child] = all;
    expect(parent?.subagentType).toBe("Explore");
    expect(parent?.description).toBe("Survey the codebase");
    expect(child?.parentId).toBe(parent?.id);

    const pm = await prisma.agent.findUnique({ where: { name: "PM" } });
    expect(pm?.status).toBe("WORKING");
    expect(pm?.currentActivityId).toBe(child?.id);
  });

  it("ends a child activity and walks currentActivityId back to the still-open parent", async () => {
    await prisma.$transaction(async (tx) => {
      await applyProjection(
        tx,
        evt(
          "ActivityStarted",
          { agent: "PM", toolUseId: "p", toolName: "Task", subagentType: "Plan" },
          "2026-05-21T12:00:00.000Z",
          "1",
        ),
      );
      await applyProjection(
        tx,
        evt(
          "ActivityStarted",
          { agent: "PM", toolUseId: "c", toolName: "Read", parentToolUseId: "p" },
          "2026-05-21T12:00:01.000Z",
          "2",
        ),
      );
    });

    await prisma.$transaction(async (tx) => {
      await applyProjection(
        tx,
        evt("ActivityEnded", { toolUseId: "c", ok: true }, "2026-05-21T12:00:02.000Z", "3"),
      );
    });

    const child = await prisma.activity.findUnique({ where: { toolUseId: "c" } });
    expect(child?.endedAt).not.toBeNull();
    expect(child?.ok).toBe(true);

    const parent = await prisma.activity.findUnique({ where: { toolUseId: "p" } });
    const pm = await prisma.agent.findUnique({ where: { name: "PM" } });
    expect(pm?.currentActivityId).toBe(parent?.id);
    expect(pm?.status).toBe("WORKING");
  });

  it("flips the agent to IDLE when the last open activity ends", async () => {
    await prisma.$transaction(async (tx) => {
      await applyProjection(
        tx,
        evt(
          "ActivityStarted",
          { agent: "BE", toolUseId: "solo", toolName: "Bash" },
          "2026-05-21T12:00:00.000Z",
          "1",
        ),
      );
    });

    await prisma.$transaction(async (tx) => {
      await applyProjection(
        tx,
        evt("ActivityEnded", { toolUseId: "solo", ok: true }, "2026-05-21T12:00:00.500Z", "2"),
      );
    });

    const be = await prisma.agent.findUnique({ where: { name: "BE" } });
    expect(be?.status).toBe("IDLE");
    expect(be?.currentActivityId).toBeNull();
  });

  it("is idempotent on retry — re-applying the same ActivityStarted does not duplicate", async () => {
    const e = evt(
      "ActivityStarted",
      { agent: "PM", toolUseId: "dup", toolName: "Bash" },
      "2026-05-21T12:00:00.000Z",
      "1",
    );
    await prisma.$transaction(async (tx) => applyProjection(tx, e));
    await prisma.$transaction(async (tx) => applyProjection(tx, e));

    const rows = await prisma.activity.findMany({ where: { toolUseId: "dup" } });
    expect(rows).toHaveLength(1);
  });

  it("ignores ActivityEnded for an unknown toolUseId", async () => {
    await prisma.$transaction(async (tx) => {
      await applyProjection(
        tx,
        evt("ActivityEnded", { toolUseId: "ghost" }, "2026-05-21T12:00:00.000Z", "1"),
      );
    });
    const rows = await prisma.activity.findMany();
    expect(rows).toHaveLength(0);
  });
});
