import type { Message } from "@prisma/client";

export type FeedItem = Message & { fromName: string };

function formatTime(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString().slice(11, 19);
}

export function LiveFeed({ feed }: { feed: FeedItem[] }) {
  return (
    <aside className="flex flex-col gap-2" aria-label="Live feed">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Live feed</h2>
      {feed.length === 0 ? (
        <p className="text-sm text-slate-500">No messages yet.</p>
      ) : (
        <ul className="space-y-2 overflow-y-auto" style={{ maxHeight: "70vh" }}>
          {feed.map((m) => (
            <li key={m.id} className="rounded border border-slate-800 bg-slate-900/40 px-3 py-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  {formatTime(m.createdAt)} · <span className="text-slate-300">{m.fromName}</span>
                  {m.taskId && <span className="ml-1 text-slate-500">({m.taskId})</span>}
                </span>
              </div>
              <div className="mt-1 text-sm text-slate-100">{m.body}</div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
