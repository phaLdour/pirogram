import { auth, signOut } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth();

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">AgentWatch</h1>
        {session?.user && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-400">{session.user.email ?? session.user.name}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/signin" });
              }}
            >
              <button
                type="submit"
                className="rounded-md border border-slate-700 px-3 py-1 hover:bg-slate-800"
              >
                Sign out
              </button>
            </form>
          </div>
        )}
      </header>

      <section>
        <h2 className="text-lg font-semibold">Sprint 1 — work in progress</h2>
        <p className="mt-2 text-sm text-slate-400">
          Auth wired. Live dashboard, webhook persistence, and settings ship in this sprint.
        </p>
        <ul className="mt-4 space-y-1 text-sm text-slate-400">
          <li>
            Webhook: <code className="text-slate-200">POST /api/webhook/events</code>
          </li>
          <li>
            Health: <code className="text-slate-200">GET /api/health</code>
          </li>
        </ul>
      </section>
    </main>
  );
}
