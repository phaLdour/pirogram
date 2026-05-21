import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AddRepoForm } from "@/components/repos/AddRepoForm";
import { revokeRepo } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Repos · AgentWatch" };

function formatDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 16).replace("T", " ") : "—";
}

export default async function ReposPage() {
  const session = await auth();
  if (!session?.user) return null;

  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const webhookUrl = `${proto}://${host}/api/webhook/github`;

  const repos = await prisma.repo.findMany({
    orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Repositories</h1>
        <p className="mt-1 text-sm text-slate-400">
          Bind a GitHub repository and AgentWatch will project its push / PR / issue /
          workflow events onto the dashboard in real time.
        </p>
      </header>

      <AddRepoForm webhookUrl={webhookUrl} />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-300">Bound repositories</h2>
        {repos.length === 0 ? (
          <p className="text-sm text-slate-500">None yet.</p>
        ) : (
          <ul className="divide-y divide-slate-800 rounded-md border border-slate-800">
            {repos.map((r) => (
              <li key={r.id} className="flex items-center gap-4 px-3 py-2">
                <div className="flex-1">
                  <div className="text-sm font-medium">
                    {r.displayName ?? r.fullName}{" "}
                    <span className="text-xs text-slate-500">({r.fullName})</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    secret {r.hint} · bound {formatDate(r.createdAt)} · last event{" "}
                    {formatDate(r.lastEventAt)}
                    {r.revokedAt && (
                      <span className="ml-1 text-red-400">
                        · revoked {formatDate(r.revokedAt)}
                      </span>
                    )}
                  </div>
                </div>
                {!r.revokedAt && (
                  <form action={revokeRepo}>
                    <input type="hidden" name="id" value={r.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-slate-700 px-2 py-1 text-xs hover:bg-red-950"
                    >
                      Revoke
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
