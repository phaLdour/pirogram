"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Repo } from "@prisma/client";

export function RepoFilter({
  repos,
  activeRepoId,
}: {
  repos: Repo[];
  activeRepoId: string | null;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  if (repos.length === 0) return null;

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(sp.toString());
    if (e.target.value) params.set("repo", e.target.value);
    else params.delete("repo");
    const query = params.toString();
    router.push(query ? `/?${query}` : "/", { scroll: false });
  }

  return (
    <select
      value={activeRepoId ?? ""}
      onChange={onChange}
      aria-label="Filter by repository"
      className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
    >
      <option value="">All repos</option>
      {repos.map((r) => (
        <option key={r.id} value={r.id}>
          {r.displayName ?? r.fullName}
        </option>
      ))}
    </select>
  );
}
