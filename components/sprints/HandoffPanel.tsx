"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { handoffToClaudeCode, stopDriving } from "@/app/sprints/actions";
import type { RepoOption, DriverMessage } from "@/components/sprints/DriveOnGitHubPanel";

const ERROR_COPY: Record<string, string> = {
  unauthorized: "Sign in again — your session expired.",
  "missing-fields": "Pick a repo.",
  "sprint-not-active": "Sprint is not active.",
  "already-driving": "Sprint is already bound to an issue.",
  "no-github-account": "Connect GitHub on /signin first.",
  "scope-insufficient": "Reconnect GitHub on /repos for `repo` scope.",
  "repo-not-bound": "Selected repo isn't bound on /repos.",
  "handoff-anti-trigger-failed": "Internal guard fired — please report.",
  "github-unauthorized": "GitHub rejected the token.",
  "github-forbidden": "GitHub denied the request (no `issues:write`?).",
  "github-not-found": "Repository not found.",
  "github-rate-limited": "GitHub rate-limited. Try in a minute.",
  "github-network": "Could not reach GitHub.",
  "github-validation": "GitHub validation failed.",
  "github-unknown": "Unexpected GitHub error.",
};

function fmtTime(iso: string): string {
  return new Date(iso).toISOString().slice(11, 16);
}

type HandoffState = {
  driverStatus: string;
  driverIssueUrl: string | null;
  driverRepoFullName: string | null;
};

export function HandoffPanel({
  sprintId,
  state,
  bindableRepos,
  messages,
  prefilledPrompt,
}: {
  sprintId: string;
  state: HandoffState;
  bindableRepos: RepoOption[];
  messages: DriverMessage[];
  prefilledPrompt: string | null;
}) {
  const router = useRouter();
  const [selectedRepo, setSelectedRepo] = useState(bindableRepos[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{
    prompt: string;
    deepLink: string;
  } | null>(prefilledPrompt
    ? {
        prompt: prefilledPrompt,
        deepLink: `https://claude.ai/new?q=${encodeURIComponent(prefilledPrompt)}`,
      }
    : null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function onHandoff() {
    if (!selectedRepo) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("sprintId", sprintId);
      fd.set("repoId", selectedRepo);
      const r = await handoffToClaudeCode(fd);
      if (!r.ok) {
        setError(r.error);
      } else {
        setIssued({ prompt: r.prompt, deepLink: r.deepLink });
        router.refresh();
      }
    });
  }

  async function copyPrompt() {
    if (!issued) return;
    await navigator.clipboard.writeText(issued.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function onStop() {
    if (!confirm("Mark hand-off as completed? You can re-open the issue manually if needed.")) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("sprintId", sprintId);
      await stopDriving(fd);
      router.refresh();
    });
  }

  if (state.driverStatus === "NOT_DRIVING") {
    return (
      <div>
        <p className="text-xs text-slate-400">
          Free. AgentWatch opens a GitHub issue with the sprint goal and gives you a
          one-click link to start a Claude Code session on the bound repo. The session
          runs under your Claude Pro subscription. AgentWatch tracks commits + PRs via
          webhooks.
        </p>
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
              onHandoff();
            }}
            className="mt-3 flex items-center gap-2"
          >
            <select
              value={selectedRepo}
              onChange={(e) => setSelectedRepo(e.target.value)}
              aria-label="Repo to hand off"
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
              {pending ? "Opening…" : "Hand off"}
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

  const isTerminal = state.driverStatus === "COMPLETED" || state.driverStatus === "FAILED";

  return (
    <div>
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-200">
            {state.driverStatus === "COMPLETED"
              ? "Hand-off completed — PR merged"
              : "Handed off to Claude Code"}
          </p>
          {state.driverRepoFullName && (
            <p className="text-xs text-slate-500">on {state.driverRepoFullName}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {state.driverIssueUrl && (
            <a
              href={state.driverIssueUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
            >
              Open issue ↗
            </a>
          )}
          {!isTerminal && (
            <button
              type="button"
              onClick={onStop}
              className="rounded-md border border-slate-700 px-2 py-1 text-xs hover:bg-red-950"
            >
              Mark done
            </button>
          )}
        </div>
      </header>

      {issued && !isTerminal && (
        <div className="mt-3 rounded-md border border-emerald-700/40 bg-emerald-950/20 p-3">
          <p className="text-xs text-emerald-200">
            Next step: open Claude Code on this repo and start a session with the prompt
            below. AgentWatch keeps watching the issue for commits + PRs.
          </p>
          <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded bg-slate-950 p-2 text-xs text-slate-100">
            {issued.prompt}
          </pre>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyPrompt}
              className="rounded-md border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
            >
              {copied ? "Copied ✓" : "Copy prompt"}
            </button>
            <a
              href={issued.deepLink}
              target="_blank"
              rel="noreferrer"
              className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-900"
            >
              Open in Claude Code ↗
            </a>
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <ul
          className="mt-3 space-y-2 overflow-y-auto"
          style={{ maxHeight: "40vh" }}
          aria-label="Hand-off transcript"
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

      {error && (
        <div className="mt-3 rounded-md border border-red-700/40 bg-red-950/30 p-2 text-xs text-red-300">
          {ERROR_COPY[error] ?? error}
        </div>
      )}
    </div>
  );
}
