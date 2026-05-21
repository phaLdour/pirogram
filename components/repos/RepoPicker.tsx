"use client";

import { useMemo, useState, useTransition } from "react";
import { bindRepo, unbindRepo, type BindResult } from "@/app/repos/actions";
import type { GhRepo } from "@/lib/github";

type BoundRepoLite = {
  id: string;
  fullName: string;
  hint: string;
  lastEventAt: Date | string | null;
};

type Banner =
  | { kind: "bound"; result: Extract<BindResult, { ok: true }> }
  | { kind: "error"; error: string }
  | null;

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString().slice(0, 16).replace("T", " ");
}

const ERROR_COPY: Record<string, string> = {
  unauthorized: "Sign in again — your session expired.",
  "no-github-account": "No GitHub account linked. Sign in with GitHub.",
  "scope-insufficient": "GitHub scope is missing. Use the Reconnect button.",
  "encryption-misconfigured":
    "Server is missing WEBHOOK_KEY_ENCRYPTION_KEY. Set it in Vercel → Settings → Environment Variables and redeploy.",
  "fullname-invalid": "Repository name format is owner/name.",
  "github-unauthorized": "GitHub rejected the token. Reconnect your account.",
  "github-forbidden": "GitHub denied the request (403). Check repo permissions.",
  "github-not-found": "Repository not found by the GitHub API.",
  "github-rate-limited": "GitHub rate-limited the request. Wait a minute.",
  "github-network": "Could not reach GitHub. Try again.",
  "github-validation": "GitHub validation failed (422). The hook may already exist.",
  "github-unknown": "Unexpected GitHub error.",
};

export function RepoPicker({
  ghRepos,
  boundRepos,
}: {
  ghRepos: GhRepo[];
  boundRepos: BoundRepoLite[];
}) {
  const [query, setQuery] = useState("");
  const [banner, setBanner] = useState<Banner>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const boundByFullName = useMemo(() => {
    const map = new Map<string, BoundRepoLite>();
    for (const r of boundRepos) map.set(r.fullName, r);
    return map;
  }, [boundRepos]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ghRepos;
    return ghRepos.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        (r.description?.toLowerCase().includes(q) ?? false),
    );
  }, [ghRepos, query]);

  function markPending(key: string, on: boolean) {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function onBind(fullName: string) {
    markPending(fullName, true);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("fullName", fullName);
      const result = await bindRepo(fd);
      markPending(fullName, false);
      if (result.ok) {
        setBanner({ kind: "bound", result });
      } else {
        setBanner({ kind: "error", error: result.error });
      }
    });
  }

  function onUnbind(repoId: string, fullName: string) {
    if (!confirm(`Unbind ${fullName}? This will remove the GitHub webhook too.`)) return;
    markPending(fullName, true);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", repoId);
      const result = await unbindRepo(fd);
      markPending(fullName, false);
      if (!result.ok) setBanner({ kind: "error", error: result.error });
      else setBanner(null);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter your repos…"
          aria-label="Filter repositories"
          className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        />
        <span className="text-xs text-slate-500">
          {filtered.length} / {ghRepos.length}
        </span>
      </div>

      {banner?.kind === "bound" && (
        <div className="rounded-md border border-emerald-700/40 bg-emerald-950/30 p-3 text-xs">
          <div className="text-emerald-200">
            <strong>{banner.result.fullName}</strong> bound.{" "}
            {banner.result.autoInstalled ? "Webhook installed on GitHub." : "Manual setup required."}
            {banner.result.alreadyExisted && " (Existing webhook with the same URL was reused.)"}
          </div>
          <div className="mt-2">
            <span className="text-emerald-100/80">Signing secret (shown once):</span>{" "}
            <code className="ml-1 select-all break-all rounded bg-slate-950 px-2 py-1">
              {banner.result.secret}
            </code>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="mt-2 rounded-md border border-slate-700 px-2 py-1 hover:bg-slate-800"
          >
            Dismiss
          </button>
        </div>
      )}
      {banner?.kind === "error" && (
        <div
          role="alert"
          className="rounded-md border border-red-700/40 bg-red-950/30 p-3 text-xs text-red-200"
        >
          {ERROR_COPY[banner.error] ?? banner.error}
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="ml-3 rounded-md border border-slate-700 px-2 py-1 hover:bg-slate-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500">No repositories match.</p>
      ) : (
        <ul
          className="divide-y divide-slate-800 overflow-y-auto rounded-md border border-slate-800"
          style={{ maxHeight: "60vh" }}
        >
          {filtered.map((r) => {
            const bound = boundByFullName.get(r.fullName);
            const pending = pendingIds.has(r.fullName);
            return (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-100">
                      {r.fullName}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                        r.private
                          ? "border border-amber-700/40 text-amber-300"
                          : "border border-slate-700 text-slate-400"
                      }`}
                    >
                      {r.private ? "private" : "public"}
                    </span>
                  </div>
                  {r.description && (
                    <div className="truncate text-xs text-slate-500">{r.description}</div>
                  )}
                  {bound && (
                    <div className="text-xs text-emerald-500/80">
                      bound · secret {bound.hint} · last event {fmtDate(bound.lastEventAt)}
                    </div>
                  )}
                </div>
                {bound ? (
                  <button
                    type="button"
                    onClick={() => onUnbind(bound.id, r.fullName)}
                    disabled={pending}
                    className="rounded-md border border-slate-700 px-3 py-1 text-xs hover:bg-red-950 disabled:opacity-50"
                    aria-label={`Unbind ${r.fullName}`}
                  >
                    {pending ? "…" : "Unbind"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onBind(r.fullName)}
                    disabled={pending}
                    className="rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-900 disabled:opacity-50"
                    aria-label={`Bind ${r.fullName}`}
                  >
                    {pending ? "Binding…" : "Bind"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
