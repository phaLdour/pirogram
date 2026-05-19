import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { AgentEvent } from "@/lib/webhook/schema";
import { applyProjection } from "@/lib/projections";

const prisma = new PrismaClient();

const baseId = "00000000-0000-4000-8000-000000000000";
const at = "2026-05-19T12:00:00.000Z";

function evt<T extends AgentEvent["type"]>(
  type: T,
  rest: Omit<Extract<AgentEvent, { type: T }>, "type" | "eventId" | "at">,
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

describe("applyProjection", () => {
  it("TaskCreated creates the task and upserts the assignee agent", async () => {
    await prisma.$transaction(async (tx) => {
      await applyProjection(
        tx,
        evt("TaskCreated", { task: { id: "T-1", title: "Schema review", assignee: "BE" } }),
      );
    });

    const task = await prisma.task.findUnique({ where: { id: "T-1" } });
    expect(task?.title).toBe("Schema review");
    expect(task?.status).toBe("PENDING");
    const be = await prisma.agent.findUnique({ where: { name: "BE" } });
    expect(be?.status).toBe("WORKING");
    expect(task?.assigneeId).toBe(be?.id);
  });

  it("TaskCompleted marks the task DONE", async () => {
    await prisma.$transaction(async (tx) => {
      await applyProjection(tx, evt("TaskCreated", { task: { id: "T-2", title: "Ship" } }, "2"));
    });
    await prisma.$transaction(async (tx) => {
      await applyProjection(tx, evt("TaskCompleted", { taskId: "T-2" }, "3"));
    });

    const task = await prisma.task.findUnique({ where: { id: "T-2" } });
    expect(task?.status).toBe("DONE");
    expect(task?.completedAt).not.toBeNull();
  });

  it("Message inserts a message and upserts both agents", async () => {
    await prisma.$transaction(async (tx) => {
      await applyProjection(
        tx,
        evt("Message", { from: "PM", to: "BE", body: "ready?" }, "4"),
      );
    });

    const pm = await prisma.agent.findUnique({ where: { name: "PM" } });
    expect(pm?.status).toBe("WORKING");
    const messages = await prisma.message.findMany();
    expect(messages).toHaveLength(1);
    expect(messages[0]?.body).toBe("ready?");
    expect(messages[0]?.fromAgentId).toBe(pm?.id);
  });

  it("TeammateIdle flips the agent to IDLE without overwriting role", async () => {
    await prisma.$transaction(async (tx) => {
      await applyProjection(tx, evt("Message", { from: "QA", body: "hi" }, "5"));
    });
    const before = await prisma.agent.findUnique({ where: { name: "QA" } });
    expect(before?.status).toBe("WORKING");

    await prisma.$transaction(async (tx) => {
      await applyProjection(tx, evt("TeammateIdle", { agent: "QA" }, "6"));
    });

    const after = await prisma.agent.findUnique({ where: { name: "QA" } });
    expect(after?.status).toBe("IDLE");
    expect(after?.role).toBe(before?.role);
  });

  it("SprintStarted then SprintEnded transitions the sprint to COMPLETED", async () => {
    let sprintId = "";
    await prisma.$transaction(async (tx) => {
      await applyProjection(
        tx,
        evt("SprintStarted", { sprint: { name: "v1.0", goal: "ship MVP" } }, "7"),
      );
      const s = await tx.sprint.findFirst();
      sprintId = s?.id ?? "";
    });
    expect(sprintId).not.toBe("");

    await prisma.$transaction(async (tx) => {
      await applyProjection(tx, evt("SprintEnded", { sprintId }, "8"));
    });

    const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
    expect(sprint?.status).toBe("COMPLETED");
    expect(sprint?.endedAt).not.toBeNull();
  });
});
