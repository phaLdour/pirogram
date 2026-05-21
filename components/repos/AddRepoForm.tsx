"use client";

import { useActionState, useState } from "react";
import { createRepo, type CreateRepoResult } from "@/app/repos/actions";

const initial: CreateRepoResult | null = null;

async function action(_prev: CreateRepoResult | null, formData: FormData) {
  return createRepo(formData);
}

export function AddRepoForm({ webhookUrl }: { webhookUrl: string }) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [copied, setCopied] = useState<"secret" | "url" | null>(null);

  function copy(text: string, kind: "secret" | "url") {
    return async () => {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    };
  }

  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/40 p-4">
      <h3 className="text-sm font-semibold">Bind a GitHub repository</h3>
      <p className="mt-1 text-xs text-slate-500">
        Enter <code>owner/name</code>. We generate a per-repo signing secret and show it
        once. Paste it into the GitHub webhook configuration on the next step.
      </p>
      <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          name="fullName"
          required
          maxLength={128}
          placeholder="phaLdour/english4kids"
          className="flex-1 min-w-[14rem] rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        />
        <input
          type="text"
          name="displayName"
          maxLength={80}
          placeholder="Display name (optional)"
          className="min-w-[10rem] rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-900 disabled:opacity-50"
        >
          {pending ? "Generating…" : "Bind"}
        </button>
      </form>

      {state?.ok && (
        <div className="mt-4 rounded-md border border-amber-700/40 bg-amber-950/30 p-3 text-xs">
          <div className="text-amber-300">
            New webhook secret for <code>{state.fullName}</code>:
          </div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 select-all break-all rounded bg-slate-950 px-2 py-1">
              {state.secret}
            </code>
            <button
              type="button"
              onClick={copy(state.secret, "secret")}
              className="rounded-md border border-slate-700 px-2 py-1 hover:bg-slate-800"
            >
              {copied === "secret" ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-3 text-amber-300/80">
            This is the only time the secret is shown. Configure the GitHub webhook with:
          </p>
          <ul className="mt-2 space-y-1 text-slate-200">
            <li>
              <span className="text-slate-500">Payload URL:</span>{" "}
              <code className="select-all">{webhookUrl}</code>{" "}
              <button
                type="button"
                onClick={copy(webhookUrl, "url")}
                className="ml-1 rounded-md border border-slate-700 px-1.5 py-0.5 text-[10px] hover:bg-slate-800"
              >
                {copied === "url" ? "Copied" : "Copy"}
              </button>
            </li>
            <li>
              <span className="text-slate-500">Content type:</span>{" "}
              <code>application/json</code>
            </li>
            <li>
              <span className="text-slate-500">Secret:</span> (the value above)
            </li>
            <li>
              <span className="text-slate-500">Events:</span> Push, Pull requests, Issues,
              Workflow runs
            </li>
          </ul>
          <a
            href={`https://github.com/${state.fullName}/settings/hooks/new`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block rounded-md border border-slate-700 px-2 py-1 hover:bg-slate-800"
          >
            Open GitHub webhook setup ↗
          </a>
        </div>
      )}
      {state && !state.ok && (
        <div className="mt-3 rounded-md border border-red-700/40 bg-red-950/30 p-2 text-xs text-red-300">
          Error: {state.error}
        </div>
      )}
    </div>
  );
}
