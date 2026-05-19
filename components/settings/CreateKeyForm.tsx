"use client";

import { useActionState, useState } from "react";
import { createWebhookKey, type CreateKeyResult } from "@/app/settings/actions";

const initial: CreateKeyResult | null = null;

async function action(_prev: CreateKeyResult | null, formData: FormData) {
  return createWebhookKey(formData);
}

export function CreateKeyForm() {
  const [state, formAction, pending] = useActionState(action, initial);
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/40 p-4">
      <h3 className="text-sm font-semibold">Generate a new webhook key</h3>
      <p className="mt-1 text-xs text-slate-500">
        The signing secret is shown <strong>once</strong>. Copy it now and store it with your
        Claude Code hook configuration. Generating a new key{" "}
        <strong>immediately revokes every previous key</strong>.
      </p>
      <form action={formAction} className="mt-3 flex items-center gap-2">
        <input
          type="text"
          name="name"
          required
          maxLength={80}
          placeholder="e.g. production-bot"
          className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-900 disabled:opacity-50"
        >
          {pending ? "Generating…" : "Generate"}
        </button>
      </form>

      {state && state.ok && (
        <div className="mt-4 rounded-md border border-amber-700/40 bg-amber-950/30 p-3">
          <div className="text-xs text-amber-300">New secret for &quot;{state.name}&quot;:</div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 select-all break-all rounded bg-slate-950 px-2 py-1 text-xs">
              {state.secret}
            </code>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(state.secret);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="rounded-md border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="mt-2 text-xs text-amber-300/80">
            This is the only time the secret will be displayed.
          </div>
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
