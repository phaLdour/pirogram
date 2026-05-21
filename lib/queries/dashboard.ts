import { prisma } from "@/lib/db";
import type { Activity, Agent, Message, Repo, Sprint, Task } from "@prisma/client";

export type ActivityNode = Activity & { children: ActivityNode[] };

export type AgentWithActivity = Agent & {
  rootActivities: ActivityNode[];
};

export type DashboardSnapshot = {
  agents: AgentWithActivity[];
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

const ACTIVITY_LOOKBACK_MS = 5 * 60 * 1000;

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

  const activityCutoff = new Date(Date.now() - ACTIVITY_LOOKBACK_MS);
  const [agents, pending, inProgress, done, feedRows, activeSprint, activities] = await Promise.all([
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
    prisma.activity.findMany({
      where: {
        OR: [{ endedAt: null }, { startedAt: { gte: activityCutoff } }],
      },
      orderBy: { startedAt: "asc" },
    }),
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

  const agentsWithActivity = attachActivityTrees(agents, activities);

  return {
    agents: agentsWithActivity,
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

function attachActivityTrees(agents: Agent[], activities: Activity[]): AgentWithActivity[] {
  const nodesById = new Map<string, ActivityNode>();
  for (const a of activities) {
    nodesById.set(a.id, { ...a, children: [] });
  }
  const rootsByAgentId = new Map<string, ActivityNode[]>();
  for (const node of nodesById.values()) {
    if (node.parentId && nodesById.has(node.parentId)) {
      nodesById.get(node.parentId)!.children.push(node);
    } else {
      const bucket = rootsByAgentId.get(node.agentId) ?? [];
      bucket.push(node);
      rootsByAgentId.set(node.agentId, bucket);
    }
  }
  return agents.map((agent) => ({
    ...agent,
    rootActivities: rootsByAgentId.get(agent.id) ?? [],
  }));
}
