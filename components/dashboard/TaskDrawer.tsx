"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Detail = {
  task: {
    id: string;
    title: string;
    description: string | null;
    status: "PENDING" | "IN_PROGRESS" | "DONE" | "CANCELLED";
    createdAt: string;
    completedAt: string | null;
    assignee: { name: string; role: string; status: string } | null;
    sprint: { id: string; name: string; version: string | null } | null;
  };
  messages: Array<{
    id: string;
    body: string;
    createdAt: string;
    fromName: string;
  }>;
};

export function TaskDrawer() {
  const router = useRouter();
  const sp = useSearchParams();
  const id = sp.get("task");

  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const close = () => {
    const params = new URLSearchParams(sp.toString());
    params.delete("task");
    const next = params.toString();
    router.push(next ? `/?${next}` : "/", { scroll: false });
  };

  useEffect(() => {
    if (!id) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/tasks/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return (await res.json()) as Detail;
      })
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "fetch-failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && id) close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!id) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Task detail"
      className="fixed inset-0 z-30 flex justify-end bg-slate-950/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <aside className="flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-slate-800 bg-slate-950 px-5 py-4 shadow-2xl">
        <header className="flex items-start justify-between gap-2">
          <div>
            <div className="font-mono text-xs text-slate-500">{id}</div>
            {detail && <h2 className="text-lg font-semibold">{detail.task.title}</h2>}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close task drawer"
            className="rounded-md border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
          >
            Close (Esc)
          </button>
        </header>

        {loading && <p className="text-sm text-slate-500">Loading…</p>}
        {error && (
          <p className="text-sm text-red-400" role="alert">
            Error: {error}
          </p>
        )}

        {detail && (
          <>
            <dl className="grid grid-cols-[5rem_1fr] gap-y-1 text-sm">
              <dt className="text-slate-500">Status</dt>
              <dd>{detail.task.status.toLowerCase()}</dd>
              <dt className="text-slate-500">Assignee</dt>
              <dd>
                {detail.task.assignee
                  ? `${detail.task.assignee.name} (${detail.task.assignee.role})`
                  : "unassigned"}
              </dd>
              <dt className="text-slate-500">Sprint</dt>
              <dd>
                {detail.task.sprint
                  ? `${detail.task.sprint.version ?? "—"} · ${detail.task.sprint.name}`
                  : "—"}
              </dd>
              <dt className="text-slate-500">Created</dt>
              <dd>{detail.task.createdAt.replace("T", " ").slice(0, 16)}</dd>
              <dt className="text-slate-500">Completed</dt>
              <dd>
                {detail.task.completedAt
                  ? detail.task.completedAt.replace("T", " ").slice(0, 16)
                  : "—"}
              </dd>
            </dl>

            {detail.task.description && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Description
                </h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">
                  {detail.task.description}
                </p>
              </section>
            )}

            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Messages ({detail.messages.length})
              </h3>
              {detail.messages.length === 0 ? (
                <p className="text-sm text-slate-500">No messages linked to this task.</p>
              ) : (
                <ul className="space-y-2">
                  {detail.messages.map((m) => (
                    <li
                      key={m.id}
                      className="rounded border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm"
                    >
                      <div className="text-xs text-slate-500">
                        {m.createdAt.slice(11, 19)} ·{" "}
                        <span className="text-slate-300">{m.fromName}</span>
                      </div>
                      <div className="mt-1 text-slate-100">{m.body}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
