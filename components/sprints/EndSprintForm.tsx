"use client";

import { useActionState } from "react";
import { endSprint, type EndSprintResult } from "@/app/sprints/actions";

const initial: EndSprintResult | null = null;

async function action(_prev: EndSprintResult | null, formData: FormData) {
  return endSprint(formData);
}

export function EndSprintForm({ sprintId }: { sprintId: string }) {
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={sprintId} />
        <label className="flex items-center gap-1 text-xs text-slate-400">
          Bump
          <select
            name="bump"
            defaultValue="auto"
            className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
            aria-label="Version bump"
          >
            <option value="auto">auto (from titles)</option>
            <option value="patch">patch</option>
            <option value="minor">minor</option>
            <option value="major">major</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Ending…" : "End sprint"}
        </button>
      </form>
      {state && state.ok && (
        <span className="text-xs text-emerald-400">Sprint ended at {state.version}</span>
      )}
      {state && !state.ok && (
        <span className="text-xs text-red-400" role="alert">
          {state.error}
        </span>
      )}
    </div>
  );
}
