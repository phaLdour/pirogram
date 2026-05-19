import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sprints · AgentWatch" };

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

export default async function SprintsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const sprints = await prisma.sprint.findMany({
    orderBy: [{ status: "asc" }, { startedAt: "desc" }],
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Sprints</h1>
        <Link
          href="/"
          className="rounded-md border border-slate-700 px-3 py-1 text-sm hover:bg-slate-800"
        >
          ← Dashboard
        </Link>
      </header>

      {sprints.length === 0 ? (
        <p className="text-sm text-slate-500">
          No sprints yet. Start one from the dashboard.
        </p>
      ) : (
        <ul className="divide-y divide-slate-800 rounded-md border border-slate-800">
          {sprints.map((s) => (
            <li key={s.id}>
              <Link
                href={`/sprints/${s.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-900/40"
              >
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {s.version && (
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-mono">
                        {s.version}
                      </span>
                    )}
                    <span>{s.name}</span>
                    <span
                      className={
                        s.status === "ACTIVE"
                          ? "text-xs text-status-working"
                          : "text-xs text-slate-500"
                      }
                    >
                      {s.status.toLowerCase()}
                    </span>
                  </div>
                  {s.goal && <div className="text-xs text-slate-500">{s.goal}</div>}
                </div>
                <div className="text-xs text-slate-500">
                  {fmtDate(s.startedAt)} → {fmtDate(s.endedAt)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
