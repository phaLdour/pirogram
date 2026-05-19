export default function DashboardPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Hello AgentWatch</h1>
      <p className="mt-4 text-slate-400">
        Sprint 0 scaffold. The live dashboard ships in Sprint 1.
      </p>
      <ul className="mt-8 space-y-2 text-sm text-slate-400">
        <li>
          Health: <code className="text-slate-200">GET /api/health</code>
        </li>
        <li>
          Webhook: <code className="text-slate-200">POST /api/webhook/events</code>
        </li>
        <li>
          Auth: <code className="text-slate-200">/api/auth/signin</code>
        </li>
      </ul>
    </main>
  );
}
