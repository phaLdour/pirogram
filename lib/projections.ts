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

export async function applyProjection(tx: Tx, event: AgentEvent): Promise<void> {
  switch (event.type) {
    case "TaskCreated": {
      const assignee = event.task.assignee
        ? await upsertAgent(tx, event.task.assignee, "WORKING")
        : null;
      await tx.task.upsert({
        where: { id: event.task.id },
        update: {
          title: event.task.title,
          description: event.task.description,
          ...(assignee ? { assigneeId: assignee.id } : {}),
        },
        create: {
          id: event.task.id,
          title: event.task.title,
          description: event.task.description,
          status: "PENDING",
          ...(assignee ? { assigneeId: assignee.id } : {}),
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
  }
}
