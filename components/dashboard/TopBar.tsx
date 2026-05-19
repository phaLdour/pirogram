import Link from "next/link";
import { signOut } from "@/lib/auth";
import type { Sprint } from "@prisma/client";

type SprintSummary = (Sprint & { totalTasks: number; doneTasks: number }) | null;
type SessionUser = { email?: string | null; name?: string | null };

export function TopBar({ sprint, user }: { sprint: SprintSummary; user: SessionUser }) {
  const pct =
    sprint && sprint.totalTasks > 0
      ? Math.round((sprint.doneTasks / sprint.totalTasks) * 100)
      : 0;

  return (
    <header className="flex items-center justify-between gap-4 border-b border-slate-800 pb-4">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold tracking-tight">AgentWatch</h1>
        {sprint ? (
          <div className="flex items-center gap-3 rounded-md bg-slate-900 px-3 py-1.5">
            <span className="text-sm font-medium">{sprint.name}</span>
            <div className="flex items-center gap-2">
              <div
                className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-800"
                role="progressbar"
                aria-label="Sprint progress"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="h-full bg-status-working" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs text-slate-400">
                {sprint.doneTasks}/{sprint.totalTasks}
              </span>
            </div>
          </div>
        ) : (
          <span className="text-xs text-slate-500">No active sprint</span>
        )}
      </div>
      <div className="flex items-center gap-3 text-sm">
        <Link
          href="/settings"
          className="rounded-md border border-slate-700 px-3 py-1 text-slate-300 hover:bg-slate-800"
        >
          Settings
        </Link>
        <span className="text-slate-400">{user.email ?? user.name}</span>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
        >
          <button
            type="submit"
            className="rounded-md border border-slate-700 px-3 py-1 hover:bg-slate-800"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
