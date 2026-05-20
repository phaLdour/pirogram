import { auth } from "@/lib/auth";
import { getDashboardSnapshot } from "@/lib/queries/dashboard";
import { AgentList } from "@/components/dashboard/AgentList";
import { TaskBoard } from "@/components/dashboard/TaskBoard";
import { LiveFeed } from "@/components/dashboard/LiveFeed";
import { TopBar } from "@/components/dashboard/TopBar";
import { LiveRefresh } from "@/components/dashboard/LiveRefresh";
import { TaskDrawer } from "@/components/dashboard/TaskDrawer";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ repo?: string; task?: string }>;
}) {
  const session = await auth();
  // Middleware already guards this route; the check below is defensive
  // and narrows the type so the JSX can rely on session.user existing.
  if (!session?.user) return null;

  const sp = await searchParams;
  const snapshot = await getDashboardSnapshot(sp.repo);

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-6 px-6 py-6"
    >
      <TopBar
        sprint={snapshot.activeSprint}
        user={session.user}
        repos={snapshot.repos}
        activeRepoId={snapshot.activeRepoId}
      />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr_320px]">
        <AgentList agents={snapshot.agents} />
        <TaskBoard tasksByStatus={snapshot.tasksByStatus} />
        <LiveFeed feed={snapshot.feed} />
      </div>
      <footer className="flex items-center justify-between border-t border-slate-800 pt-3">
        <LiveRefresh />
        <span className="text-xs text-slate-600">
          Webhook: <code>/api/webhook/events</code>
        </span>
      </footer>
      <TaskDrawer />
    </main>
  );
}
