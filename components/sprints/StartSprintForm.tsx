"use client";

import { useActionState } from "react";
import { startSprint, type StartSprintResult } from "@/app/sprints/actions";

const initial: StartSprintResult | null = null;

async function action(_prev: StartSprintResult | null, formData: FormData) {
  return startSprint(formData);
}

export function StartSprintForm() {
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        name="name"
        required
        maxLength={80}
        placeholder="Sprint name (e.g. Q3-W1)"
        className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        aria-label="Sprint name"
      />
      <input
        type="text"
        name="goal"
        maxLength={200}
        placeholder="Goal (optional)"
        className="min-w-[16rem] flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        aria-label="Sprint goal"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-900 disabled:opacity-50"
      >
        {pending ? "Starting…" : "Start sprint"}
      </button>
      {state && !state.ok && (
        <span className="text-xs text-red-400" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}
