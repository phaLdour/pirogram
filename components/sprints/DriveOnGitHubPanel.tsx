"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { driveSprintOnGitHub, replyToDriver, stopDriving } from "@/app/sprints/actions";

export type DriverStatus =
  | "NOT_DRIVING"
  | "REQUESTED"
  | "RUNNING"
  | "AWAITING_USER"
  | "COMPLETED"
  | "FAILED";

export type RepoOption = { id: string; fullName: string };

export type DriverMessage = {
  id: string;
  fromName: string;
  body: string;
  createdAt: string;
  isBot: boolean;
};

const ERROR_COPY: Record<string, string> = {
  unauthorized: "Sign in again — your session expired.",
  "missing-fields": "Pick a repo.",
  "sprint-not-active": "Sprint is not active — start a fresh one to drive.",
  "already-driving": "Already driving on a GitHub issue.",
  "repo-not-bound": "Selected repo isn't bound on /repos.",
  "no-github-account": "Connect GitHub on /signin first.",
  "scope-insufficient": "Reconnect GitHub on /repos for `repo` scope.",
  "github-unauthorized": "GitHub rejected the token. Reconnect on /repos.",
  "github-forbidden": "GitHub denied the request (no `issues:write`?).",
  "github-not-found": "Repository not found.",
  "github-rate-limited": "GitHub rate-limited. Try in a minute.",
  "github-network": "Could not reach GitHub.",
  "github-validation": "GitHub validation failed.",
  "github-unknown": "Unexpected GitHub error.",
  "message-too-long": "Reply is too long (max 8000 chars).",
  "not-driving": "This sprint isn't bound to a GitHub issue yet.",
};

function statusLabel(s: DriverStatus): string {
  switch (s) {
    case "REQUESTED":
      return "Issue opened — waiting for Claude Code Action to pick up";
    case "RUNNING":
      return "Claude is working on the repo";
    case "AWAITING_USER":
      return "Claude is waiting for your reply";
    case "COMPLETED":
      return "Done — PR merged";
    case "FAILED":
      return "Workflow run failed";
    default:
      return "";
  }
}

function fmtTime(iso: string): string {
  return new Date(iso).toISOString().slice(11, 16);
}

export function DriveOnGitHubPanel({
  sprintId,
  driverStatus,
  driverIssueUrl,
  driverRepoFullName,
  bindableRepos,
  messages,
}: {
  sprintId: string;
  driverStatus: DriverStatus;
  driverIssueUrl: string | null;
  driverRepoFullName: string | null;
  bindableRepos: RepoOption[];
  messages: DriverMessage[];
}) {
  const router = useRouter();
  const [selectedRepo, setSelectedRepo] = useState(bindableRepos[0]?.id ?? "");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onDrive() {
    if (!selectedRepo) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("sprintId", sprintId);
      fd.set("repoId", selectedRepo);
      const r = await driveSprintOnGitHub(fd);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  function onReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setError(null);
    const message = reply;
    setReply("");
    startTransition(async () => {
      const fd = new FormData();
      fd.set("sprintId", sprintId);
      fd.set("message", message);
      const r = await replyToDriver(fd);
      if (!r.ok) {
        setError(r.error);
        setReply(message);
      } else {
        router.refresh();
      }
    });
  }

  function onStop() {
    if (!confirm("Mark driver as completed? Claude may still be running on GitHub.")) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("sprintId", sprintId);
      await stopDriving(fd);
      router.refresh();
    });
  }

  if (driverStatus === "NOT_DRIVING") {
    return (
      <div>
        <p className="text-xs text-slate-400">
          Open an issue on a bound repo with the sprint goal as the prompt.
          AgentWatch&apos;s{" "}
          <a
            href="https://github.com/anthropics/claude-code-action"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            <code>anthropics/claude-code-action</code>
          </a>{" "}
          workflow picks it up, Claude Code works in a GitHub runner, commits land
          back, and AgentWatch&apos;s existing webhook integration streams every event.
        </p>
        <details className="mt-3 text-xs text-slate-400">
          <summary className="cursor-pointer text-slate-300">
            One-time setup on the target repo (5 min)
          </summary>
          <ol className="ml-4 mt-2 list-decimal space-y-1">
            <li>
              Copy{" "}
              <code>.github/workflows/claude.yml</code> from{" "}
              <a
                href="https://github.com/phaLdour/pirogram/blob/main/docs/integrations/github-action-template/claude.yml"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                this template
              </a>{" "}
              into the repo.
            </li>
            <li>
              Add <code>ANTHROPIC_API_KEY</code> as a GitHub Secret (Settings → Secrets
              → Actions).
            </li>
            <li>Commit + push. The workflow is now active.</li>
          </ol>
        </details>
        {bindableRepos.length === 0 ? (
          <p className="mt-3 text-xs text-amber-300">
            Bind a repo on{" "}
            <a href="/repos" className="underline">
              /repos
            </a>{" "}
            first.
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onDrive();
            }}
            className="mt-3 flex items-center gap-2"
          >
            <select
              value={selectedRepo}
              onChange={(e) => setSelectedRepo(e.target.value)}
              aria-label="Repo to drive on"
              className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
            >
              {bindableRepos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={pending || !selectedRepo}
              className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-900 disabled:opacity-50"
            >
              {pending ? "Opening…" : "Drive on GitHub"}
            </button>
          </form>
        )}
        {error && (
          <div className="mt-3 rounded-md border border-red-700/40 bg-red-950/30 p-2 text-xs text-red-300">
            {ERROR_COPY[error] ?? error}
          </div>
        )}
      </div>
    );
  }

  const statusColor =
    driverStatus === "AWAITING_USER"
      ? "text-amber-300"
      : driverStatus === "COMPLETED"
        ? "text-emerald-300"
        : driverStatus === "FAILED"
          ? "text-red-300"
          : "text-slate-300";

  return (
    <div>
      <header className="flex items-center justify-between">
        <div>
          <p className={`text-sm font-medium ${statusColor}`}>
            {statusLabel(driverStatus)}
            {driverRepoFullName && (
              <span className="ml-2 text-slate-500">on {driverRepoFullName}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {driverIssueUrl && (
            <a
              href={driverIssueUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
            >
              Open issue ↗
            </a>
          )}
          {driverStatus !== "COMPLETED" && driverStatus !== "FAILED" && (
            <button
              type="button"
              onClick={onStop}
              className="rounded-md border border-slate-700 px-2 py-1 text-xs hover:bg-red-950"
            >
              Stop driving
            </button>
          )}
        </div>
      </header>

      {messages.length > 0 && (
        <ul
          className="mt-3 space-y-2 overflow-y-auto"
          style={{ maxHeight: "40vh" }}
          aria-label="Driver transcript"
        >
          {messages.map((m) => (
            <li
              key={m.id}
              className={`rounded-md border px-3 py-2 text-sm ${
                m.isBot
                  ? "border-emerald-900/40 bg-emerald-950/10"
                  : "border-slate-800 bg-slate-950"
              }`}
            >
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500">
                <span>{m.fromName}</span>
                <span>{fmtTime(m.createdAt)}</span>
              </div>
              <pre className="mt-1 whitespace-pre-wrap break-words text-slate-100">{m.body}</pre>
            </li>
          ))}
        </ul>
      )}

      {(driverStatus === "AWAITING_USER" ||
        driverStatus === "RUNNING" ||
        driverStatus === "REQUESTED") && (
        <form onSubmit={onReply} className="mt-3 flex items-end gap-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={2}
            maxLength={8000}
            placeholder={
              driverStatus === "AWAITING_USER"
                ? "Answer Claude's question…"
                : "Send a follow-up (@claude prefix added automatically)"
            }
            className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending || !reply.trim()}
            className="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
          >
            {pending ? "…" : "Reply"}
          </button>
        </form>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-red-700/40 bg-red-950/30 p-2 text-xs text-red-300">
          {ERROR_COPY[error] ?? error}
        </div>
      )}
    </div>
  );
}
