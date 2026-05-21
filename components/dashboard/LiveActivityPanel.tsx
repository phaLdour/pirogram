import type { AgentWithActivity } from "@/lib/queries/dashboard";
import type { Agent } from "@prisma/client";
import { ActivityTree } from "@/components/dashboard/ActivityNode";

const STATUS_LABEL: Record<Agent["status"], string> = {
  IDLE: "idle",
  WORKING: "working",
  BLOCKED: "blocked",
  OFFLINE: "offline",
};

const STATUS_CLASS: Record<Agent["status"], string> = {
  IDLE: "bg-status-idle",
  WORKING: "bg-status-working",
  BLOCKED: "bg-status-blocked",
  OFFLINE: "bg-status-offline",
};

export function LiveActivityPanel({
  agents,
  handoffMode,
}: {
  agents: AgentWithActivity[];
  handoffMode: boolean;
}) {
  const noActivityYet = agents.every((a) => a.rootActivities.length === 0);

  return (
    <aside className="flex flex-col gap-3" aria-label="Live agent activity">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Live activity
      </h2>

      {agents.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-800 px-3 py-6 text-center">
          <p className="text-sm text-slate-400">No agents reported yet.</p>
          <p className="mt-1 text-xs text-slate-500">
            Install the Claude Code hook on a machine running <code>claude</code> to
            stream subagent activity.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {agents.map((a) => (
            <li
              key={a.id}
              className="rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_CLASS[a.status]} ${
                    a.status === "WORKING" ? "animate-pulse" : ""
                  }`}
                />
                <span className="text-sm font-medium">{a.name}</span>
                <span className="text-[10px] text-slate-500">{a.role}</span>
                <span
                  className="ml-auto text-[10px] uppercase tracking-wider text-slate-500"
                  aria-label={`status: ${STATUS_LABEL[a.status]}`}
                >
                  {STATUS_LABEL[a.status]}
                </span>
              </div>
              {a.rootActivities.length > 0 ? (
                <div className="mt-2">
                  <ActivityTree nodes={a.rootActivities} />
                </div>
              ) : (
                a.status !== "WORKING" && (
                  <p className="mt-1 text-[10px] text-slate-600">no recent tool calls</p>
                )
              )}
            </li>
          ))}
        </ul>
      )}

      {handoffMode && noActivityYet && (
        <p className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-500">
          Web Claude Code sessions don&apos;t fire user hooks, so subagent activity
          isn&apos;t visible here. GitHub commits + PRs still stream into the feed
          on the right.
        </p>
      )}
    </aside>
  );
}
