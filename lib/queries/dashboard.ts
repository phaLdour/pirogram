import { prisma } from "@/lib/db";
import type { Agent, Message, Repo, Sprint, Task } from "@prisma/client";

export type DashboardSnapshot = {
  agents: Agent[];
  tasksByStatus: {
    PENDING: Task[];
    IN_PROGRESS: Task[];
    DONE: Task[];
  };
  feed: Array<Message & { fromName: string }>;
  activeSprint: (Sprint & { totalTasks: number; doneTasks: number }) | null;
  repos: Repo[];
  activeRepoId: string | null;
};

const FEED_LIMIT = 50;
const TASK_COLUMN_LIMIT = 50;

export async function getDashboardSnapshot(
  repoFilter?: string | null,
): Promise<DashboardSnapshot> {
  const repos = await prisma.repo.findMany({
    where: { revokedAt: null },
    orderBy: { fullName: "asc" },
  });
  const activeRepoId =
    repoFilter && repos.some((r) => r.id === repoFilter) ? repoFilter : null;
  const repoWhere = activeRepoId ? { repoId: activeRepoId } : {};

  const [agents, pending, inProgress, done, feedRows, activeSprint] = await Promise.all([
    prisma.agent.findMany({ orderBy: { name: "asc" } }),
    prisma.task.findMany({
      where: { status: "PENDING", ...repoWhere },
      orderBy: { createdAt: "desc" },
      take: TASK_COLUMN_LIMIT,
    }),
    prisma.task.findMany({
      where: { status: "IN_PROGRESS", ...repoWhere },
      orderBy: { createdAt: "desc" },
      take: TASK_COLUMN_LIMIT,
    }),
    prisma.task.findMany({
      where: { status: "DONE", ...repoWhere },
      orderBy: { completedAt: "desc" },
      take: TASK_COLUMN_LIMIT,
    }),
    prisma.message.findMany({
      where: repoWhere,
      orderBy: { createdAt: "desc" },
      take: FEED_LIMIT,
      include: { from: { select: { name: true } } },
    }),
    prisma.sprint.findFirst({ where: { status: "ACTIVE" }, orderBy: { startedAt: "desc" } }),
  ]);

  let sprintCounts: { totalTasks: number; doneTasks: number } | null = null;
  if (activeSprint) {
    const [total, doneCount] = await Promise.all([
      prisma.task.count({ where: { sprintId: activeSprint.id, ...repoWhere } }),
      prisma.task.count({
        where: { sprintId: activeSprint.id, status: "DONE", ...repoWhere },
      }),
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
    repos,
    activeRepoId,
  };
}
