"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claudeChat, enableClaudeOnSprint } from "@/app/sprints/actions";

export type ClaudeMessageVM = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
  tokensIn?: number | null;
  tokensOut?: number | null;
  tokensCacheR?: number | null;
};

const ERROR_COPY: Record<string, string> = {
  unauthorized: "Sign in again — your session expired.",
  "anthropic-not-configured":
    "Server is missing ANTHROPIC_API_KEY. Set it in Vercel → Settings → Environment Variables.",
  "claude-not-enabled": "Enable Claude on this sprint first.",
  "anthropic-api-failed": "Anthropic API call failed. Try again.",
  "anthropic-empty-reply": "Claude returned an empty response. Try rephrasing.",
  "sprint-not-found": "Sprint not found.",
  "message-too-long": "Message is too long (max 8000 chars).",
};

function fmtTime(iso: string): string {
  return new Date(iso).toISOString().slice(11, 16);
}

export function ClaudeRunPanel({
  sprintId,
  enabled,
  messages,
}: {
  sprintId: string;
  enabled: boolean;
  messages: ClaudeMessageVM[];
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onEnable() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", sprintId);
      const r = await enableClaudeOnSprint(fd);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setError(null);
    const message = input;
    setInput("");
    startTransition(async () => {
      const fd = new FormData();
      fd.set("sprintId", sprintId);
      fd.set("message", message);
      const r = await claudeChat(fd);
      if (!r.ok) {
        setError(r.error);
        setInput(message); // restore on failure
      } else {
        router.refresh();
      }
    });
  }

  if (!enabled) {
    return (
      <section className="rounded-md border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="text-sm font-semibold text-slate-300">Drive with Claude</h2>
        <p className="mt-1 text-xs text-slate-500">
          Send this sprint&apos;s goal to Claude and chat with it like Claude Code in plan
          mode. Claude can ask clarifying questions and propose a task list. Code
          execution still happens in your local Claude Code session — paste the final plan
          there to start work.
        </p>
        <button
          type="button"
          onClick={onEnable}
          disabled={pending}
          className="mt-3 rounded-md bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-900 disabled:opacity-50"
        >
          {pending ? "Enabling…" : "Enable Claude on this sprint"}
        </button>
        {error && (
          <div className="mt-3 rounded-md border border-red-700/40 bg-red-950/30 p-2 text-xs text-red-300">
            {ERROR_COPY[error] ?? error}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-md border border-slate-800 bg-slate-900/40 p-4">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">Claude planning copilot</h2>
        <span className="text-xs text-slate-500">claude-opus-4-7 · adaptive</span>
      </header>

      {messages.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          Send the first message to kick off planning — the sprint goal will be attached
          as context automatically.
        </p>
      ) : (
        <ul className="mt-3 space-y-3" style={{ maxHeight: "50vh", overflowY: "auto" }}>
          {messages.map((m) => (
            <li
              key={m.id}
              className={`rounded-md border px-3 py-2 ${
                m.role === "USER"
                  ? "border-slate-800 bg-slate-950"
                  : "border-emerald-900/40 bg-emerald-950/10"
              }`}
            >
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500">
                <span>{m.role === "USER" ? "you" : "claude"}</span>
                <span>
                  {fmtTime(m.createdAt)}
                  {m.role === "ASSISTANT" && m.tokensIn != null && (
                    <span className="ml-2 text-slate-600">
                      ↓{m.tokensIn}
                      {m.tokensCacheR ? `↻${m.tokensCacheR}` : ""} ↑{m.tokensOut ?? 0}
                    </span>
                  )}
                </span>
              </div>
              <pre className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-100">
                {m.content}
              </pre>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onSend} className="mt-3 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          maxLength={8000}
          placeholder={
            messages.length === 0
              ? "What do you want this sprint to deliver?"
              : "Reply to Claude…"
          }
          className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
        >
          {pending ? "…" : "Send"}
        </button>
      </form>
      {error && (
        <div className="mt-3 rounded-md border border-red-700/40 bg-red-950/30 p-2 text-xs text-red-300">
          {ERROR_COPY[error] ?? error}
        </div>
      )}
    </section>
  );
}
