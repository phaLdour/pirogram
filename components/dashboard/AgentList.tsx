import type { Agent } from "@prisma/client";

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

export function AgentList({ agents }: { agents: Agent[] }) {
  return (
    <aside className="flex flex-col gap-2" aria-label="Agents">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Agents</h2>
      {agents.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-800 px-3 py-6 text-center">
          <p className="text-sm text-slate-400">No agents reported yet.</p>
          <p className="mt-1 text-xs text-slate-500">
            Send a signed event to the webhook to register one.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {agents.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2"
            >
              <span
                aria-hidden
                className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_CLASS[a.status]}`}
              />
              <div className="flex flex-1 flex-col">
                <span className="text-sm font-medium">{a.name}</span>
                <span className="text-xs text-slate-500">{a.role}</span>
              </div>
              <span className="text-xs text-slate-400" aria-label={`status: ${STATUS_LABEL[a.status]}`}>
                {STATUS_LABEL[a.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
