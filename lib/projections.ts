import type { Prisma } from "@prisma/client";
import type { AgentEvent } from "@/lib/webhook/schema";

type Tx = Prisma.TransactionClient;

async function upsertAgent(tx: Tx, name: string, status?: "IDLE" | "WORKING" | "BLOCKED" | "OFFLINE") {
  return tx.agent.upsert({
    where: { name },
    update: {
      lastSeenAt: new Date(),
      ...(status ? { status } : {}),
    },
    create: {
      name,
      role: "unknown",
      lastSeenAt: new Date(),
      ...(status ? { status } : {}),
    },
  });
}

export type ProjectionOptions = { repoId?: string };

export async function applyProjection(
  tx: Tx,
  event: AgentEvent,
  opts: ProjectionOptions = {},
): Promise<void> {
  const { repoId } = opts;
  switch (event.type) {
    case "TaskCreated": {
      const assignee = event.task.assignee
        ? await upsertAgent(tx, event.task.assignee, "WORKING")
        : null;
      const activeSprint = await tx.sprint.findFirst({ where: { status: "ACTIVE" } });
      await tx.task.upsert({
        where: { id: event.task.id },
        update: {
          title: event.task.title,
          description: event.task.description,
          ...(assignee ? { assigneeId: assignee.id } : {}),
          ...(activeSprint ? { sprintId: activeSprint.id } : {}),
          ...(repoId ? { repoId } : {}),
        },
        create: {
          id: event.task.id,
          title: event.task.title,
          description: event.task.description,
          status: "PENDING",
          ...(assignee ? { assigneeId: assignee.id } : {}),
          ...(activeSprint ? { sprintId: activeSprint.id } : {}),
          ...(repoId ? { repoId } : {}),
        },
      });
      return;
    }

    case "TaskCompleted": {
      await tx.task.update({
        where: { id: event.taskId },
        data: { status: "DONE", completedAt: new Date(event.at) },
      });
      return;
    }

    case "TeammateIdle": {
      await upsertAgent(tx, event.agent, "IDLE");
      return;
    }

    case "Message": {
      const from = await upsertAgent(tx, event.from, "WORKING");
      const to = event.to ? await upsertAgent(tx, event.to) : null;
      await tx.message.create({
        data: {
          fromAgentId: from.id,
          toAgentId: to?.id,
          taskId: event.taskId,
          body: event.body,
          createdAt: new Date(event.at),
          ...(repoId ? { repoId } : {}),
        },
      });
      return;
    }

    case "SprintStarted": {
      await tx.sprint.create({
        data: {
          name: event.sprint.name,
          goal: event.sprint.goal,
          status: "ACTIVE",
          startedAt: new Date(event.at),
        },
      });
      return;
    }

    case "SprintEnded": {
      await tx.sprint.update({
        where: { id: event.sprintId },
        data: { status: "COMPLETED", endedAt: new Date(event.at) },
      });
      return;
    }

    case "ActivityStarted": {
      const agent = await upsertAgent(tx, event.agent, "WORKING");
      const parent = event.parentToolUseId
        ? await tx.activity.findUnique({ where: { toolUseId: event.parentToolUseId } })
        : null;
      const startedAt = new Date(event.at);
      const activity = await tx.activity.upsert({
        where: { toolUseId: event.toolUseId },
        update: {},
        create: {
          toolUseId: event.toolUseId,
          agentId: agent.id,
          parentId: parent?.id ?? null,
          toolName: event.toolName,
          subagentType: event.subagentType,
          description: event.description,
          sessionId: event.sessionId,
          startedAt,
        },
      });
      await tx.agent.update({
        where: { id: agent.id },
        data: { currentActivityId: activity.id, lastSeenAt: startedAt },
      });
      return;
    }

    case "ActivityEnded": {
      const existing = await tx.activity.findUnique({
        where: { toolUseId: event.toolUseId },
      });
      if (!existing) return;
      const endedAt = new Date(event.at);
      await tx.activity.update({
        where: { id: existing.id },
        data: { endedAt, ok: event.ok ?? null },
      });
      const agent = await tx.agent.findUnique({ where: { id: existing.agentId } });
      if (!agent) return;
      if (agent.currentActivityId !== existing.id) return;
      // Pop up to the nearest still-open ancestor; if there's none, the
      // agent has nothing in flight → flip to IDLE.
      let cursorParentId = existing.parentId;
      let next: { id: string } | null = null;
      while (cursorParentId) {
        const candidate = await tx.activity.findUnique({
          where: { id: cursorParentId },
          select: { id: true, parentId: true, endedAt: true },
        });
        if (!candidate) break;
        if (candidate.endedAt === null) {
          next = { id: candidate.id };
          break;
        }
        cursorParentId = candidate.parentId;
      }
      await tx.agent.update({
        where: { id: agent.id },
        data: {
          currentActivityId: next?.id ?? null,
          status: next ? "WORKING" : "IDLE",
          lastSeenAt: endedAt,
        },
      });
      return;
    }
  }
}
