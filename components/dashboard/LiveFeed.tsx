"use client";

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Message } from "@prisma/client";

export type FeedItem = Message & { fromName: string };

type TypeFilter = "all" | "with-task" | "broadcast";

function formatTime(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString().slice(11, 19);
}

export function LiveFeed({ feed }: { feed: FeedItem[] }) {
  const [agent, setAgent] = useState<string>("");
  const [taskQ, setTaskQ] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const agents = useMemo(() => {
    const set = new Set<string>();
    for (const m of feed) set.add(m.fromName);
    return Array.from(set).sort();
  }, [feed]);

  const filtered = useMemo(() => {
    return feed.filter((m) => {
      if (agent && m.fromName !== agent) return false;
      if (taskQ && (!m.taskId || !m.taskId.toLowerCase().includes(taskQ.toLowerCase()))) {
        return false;
      }
      if (typeFilter === "with-task" && !m.taskId) return false;
      if (typeFilter === "broadcast" && m.toAgentId) return false;
      return true;
    });
  }, [feed, agent, taskQ, typeFilter]);

  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 12,
  });

  return (
    <aside className="flex h-full flex-col gap-2" aria-label="Live feed">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Live feed
        </h2>
        <span className="text-xs text-slate-500" aria-live="polite">
          {filtered.length} / {feed.length}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
          aria-label="Filter by agent"
          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
        >
          <option value="">All agents</option>
          {agents.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={taskQ}
          onChange={(e) => setTaskQ(e.target.value)}
          placeholder="task id…"
          aria-label="Filter by task id"
          className="w-24 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          aria-label="Filter by message type"
          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
        >
          <option value="all">All types</option>
          <option value="with-task">Linked to task</option>
          <option value="broadcast">Broadcast</option>
        </select>
        {(agent || taskQ || typeFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setAgent("");
              setTaskQ("");
              setTypeFilter("all");
            }}
            className="rounded-md border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
          >
            Clear
          </button>
        )}
      </div>

      {feed.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-800 px-3 py-6 text-center">
          <p className="text-sm text-slate-400">No messages yet.</p>
          <p className="mt-1 text-xs text-slate-500">
            Agent chatter streams in here as it arrives.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-500">No messages match the current filters.</p>
      ) : (
        <div ref={parentRef} className="overflow-y-auto" style={{ maxHeight: "70vh" }}>
          <div
            style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}
          >
            {virtualizer.getVirtualItems().map((row) => {
              const m = filtered[row.index];
              if (!m) return null;
              return (
                <div
                  key={m.id}
                  data-index={row.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${row.start}px)`,
                  }}
                  className="pb-2"
                >
                  <div className="rounded border border-slate-800 bg-slate-900/40 px-3 py-2">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>
                        {formatTime(m.createdAt)} ·{" "}
                        <span className="text-slate-300">{m.fromName}</span>
                        {m.taskId && (
                          <span className="ml-1 text-slate-500">({m.taskId})</span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-slate-100">{m.body}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}
