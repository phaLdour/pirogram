import { prisma } from "@/lib/db";
import type { Agent, Message, Sprint, Task } from "@prisma/client";

export type DashboardSnapshot = {
  agents: Agent[];
  tasksByStatus: {
    PENDING: Task[];
    IN_PROGRESS: Task[];
    DONE: Task[];
  };
  feed: Array<Message & { fromName: string }>;
  activeSprint: (Sprint & { totalTasks: number; doneTasks: number }) | null;
};

const FEED_LIMIT = 50;
const TASK_COLUMN_LIMIT = 50;

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const [agents, pending, inProgress, done, feedRows, activeSprint] = await Promise.all([
    prisma.agent.findMany({ orderBy: { name: "asc" } }),
    prisma.task.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: TASK_COLUMN_LIMIT,
    }),
    prisma.task.findMany({
      where: { status: "IN_PROGRESS" },
      orderBy: { createdAt: "desc" },
      take: TASK_COLUMN_LIMIT,
    }),
    prisma.task.findMany({
      where: { status: "DONE" },
      orderBy: { completedAt: "desc" },
      take: TASK_COLUMN_LIMIT,
    }),
    prisma.message.findMany({
      orderBy: { createdAt: "desc" },
      take: FEED_LIMIT,
      include: { from: { select: { name: true } } },
    }),
    prisma.sprint.findFirst({ where: { status: "ACTIVE" }, orderBy: { startedAt: "desc" } }),
  ]);

  let sprintCounts: { totalTasks: number; doneTasks: number } | null = null;
  if (activeSprint) {
    const [total, doneCount] = await Promise.all([
      prisma.task.count({ where: { sprintId: activeSprint.id } }),
      prisma.task.count({ where: { sprintId: activeSprint.id, status: "DONE" } }),
    ]);
    sprintCounts = { totalTasks: total, doneTasks: doneCount };
  }

  return {
    agents,
    tasksByStatus: { PENDING: pending, IN_PROGRESS: inProgress, DONE: done },
    feed: feedRows.map((m) => ({
      ...m,
      fromName: m.from.name,
    })),
    activeSprint: activeSprint && sprintCounts ? { ...activeSprint, ...sprintCounts } : null,
  };
}
