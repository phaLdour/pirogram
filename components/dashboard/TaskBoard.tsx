import type { Task } from "@prisma/client";

type Buckets = {
  PENDING: Task[];
  IN_PROGRESS: Task[];
  DONE: Task[];
};

const COLUMN_TITLES: Record<keyof Buckets, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
};

export function TaskBoard({ tasksByStatus }: { tasksByStatus: Buckets }) {
  return (
    <section className="flex flex-col gap-2" aria-label="Tasks">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tasks</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {(Object.keys(COLUMN_TITLES) as (keyof Buckets)[]).map((status) => (
          <div
            key={status}
            className="flex flex-col rounded-md border border-slate-800 bg-slate-900/40"
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
              <span className="text-sm font-medium">{COLUMN_TITLES[status]}</span>
              <span className="text-xs text-slate-500">{tasksByStatus[status].length}</span>
            </div>
            <ul className="flex flex-col gap-2 p-2">
              {tasksByStatus[status].map((t) => (
                <li
                  key={t.id}
                  className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
                >
                  <div className="font-medium">{t.title}</div>
                  <div className="mt-1 text-xs text-slate-500">{t.id}</div>
                </li>
              ))}
              {tasksByStatus[status].length === 0 && (
                <li className="px-1 py-2 text-xs text-slate-600">empty</li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
