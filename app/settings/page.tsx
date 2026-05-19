import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CreateKeyForm } from "@/components/settings/CreateKeyForm";
import { revokeWebhookKey } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Settings · AgentWatch" };

function formatDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 16).replace("T", " ") : "—";
}

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const webhookUrl = `${proto}://${host}/api/webhook/events`;

  const keys = await prisma.webhookKey.findMany({
    orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-slate-400">
          Configure your webhook endpoint for Claude Code hooks.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-300">Webhook URL</h2>
        <code className="block select-all rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm">
          {webhookUrl}
        </code>
        <p className="text-xs text-slate-500">
          Send signed POST requests here. Required headers: <code>X-AgentWatch-Signature</code>{" "}
          (<code>sha256=&lt;hex&gt;</code>) and <code>X-AgentWatch-Timestamp</code> (unix seconds, ±5
          min).
        </p>
      </section>

      <CreateKeyForm />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-300">Existing keys</h2>
        {keys.length === 0 ? (
          <p className="text-sm text-slate-500">No keys yet.</p>
        ) : (
          <ul className="divide-y divide-slate-800 rounded-md border border-slate-800">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center gap-4 px-3 py-2">
                <div className="flex-1">
                  <div className="text-sm font-medium">{k.name}</div>
                  <div className="text-xs text-slate-500">
                    {k.hint} · created {formatDate(k.createdAt)} · last used{" "}
                    {formatDate(k.lastUsedAt)}
                    {k.revokedAt && (
                      <span className="ml-1 text-red-400">· revoked {formatDate(k.revokedAt)}</span>
                    )}
                  </div>
                </div>
                {!k.revokedAt && (
                  <form action={revokeWebhookKey}>
                    <input type="hidden" name="id" value={k.id} />
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
