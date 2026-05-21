import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getGithubAccount } from "@/lib/github-token";
import { GitHubApiError, hasRequiredScopes, listMyRepos } from "@/lib/github";
import { log } from "@/lib/log";
import { ReauthorizeCard } from "@/components/repos/ReauthorizeCard";
import { RepoPicker } from "@/components/repos/RepoPicker";
import { AddRepoForm } from "@/components/repos/AddRepoForm";
import { unbindRepoForm } from "./actions";

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

  const [account, boundRepos] = await Promise.all([
    getGithubAccount(session.user.id),
    prisma.repo.findMany({
      orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
    }),
  ]);

  if (!account) {
    return (
      <PageShell>
        <ReauthorizeCard reason="no-account" />
      </PageShell>
    );
  }
  if (!hasRequiredScopes(account.scope)) {
    return (
      <PageShell>
        <ReauthorizeCard reason="scope" />
        <BoundRepoList repos={boundRepos} />
      </PageShell>
    );
  }

  let ghRepos = null as Awaited<ReturnType<typeof listMyRepos>> | null;
  let listError: string | null = null;
  try {
    ghRepos = await listMyRepos(account.accessToken);
  } catch (err) {
    const kind = err instanceof GitHubApiError ? err.kind : "unknown";
    log.warn("repos.list-failed", { kind });
    listError = kind;
  }

  return (
    <PageShell>
      {ghRepos ? (
        <RepoPicker
          ghRepos={ghRepos}
          boundRepos={boundRepos
            .filter((r) => r.revokedAt === null)
            .map((r) => ({
              id: r.id,
              fullName: r.fullName,
              hint: r.hint,
              lastEventAt: r.lastEventAt,
            }))}
        />
      ) : (
        <div
          role="alert"
          className="rounded-md border border-red-700/40 bg-red-950/30 p-3 text-xs text-red-200"
        >
          Could not load your repositories from GitHub ({listError}). Try the manual
          fallback below.
        </div>
      )}

      <BoundRepoList repos={boundRepos} />

      <details className="rounded-md border border-slate-800 bg-slate-900/40 p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          Add a repo manually (advanced)
        </summary>
        <p className="mt-2 text-xs text-slate-500">
          Use this when the repository isn&apos;t visible to your token (e.g. an org
          repo) or when GitHub API is unreachable. You&apos;ll paste the secret into
          GitHub yourself.
        </p>
        <div className="mt-3">
          <AddRepoForm webhookUrl={webhookUrl} />
        </div>
      </details>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Repositories</h1>
        <p className="mt-1 text-sm text-slate-400">
          Pick a GitHub repository to bind. AgentWatch installs the webhook for you and
          starts projecting events onto the dashboard in real time.
        </p>
      </header>
      {children}
    </main>
  );
}

function BoundRepoList({
  repos,
}: {
  repos: Array<{
    id: string;
    fullName: string;
    displayName: string | null;
    hint: string;
    createdAt: Date;
    lastEventAt: Date | null;
    revokedAt: Date | null;
    githubHookId: number | null;
  }>;
}) {
  if (repos.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-slate-300">Bound repositories</h2>
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
                {r.githubHookId ? " · auto-installed" : " · manual"}
                {r.revokedAt && (
                  <span className="ml-1 text-red-400">
                    · revoked {formatDate(r.revokedAt)}
                  </span>
                )}
              </div>
            </div>
            {!r.revokedAt && (
              <form action={unbindRepoForm}>
                <input type="hidden" name="id" value={r.id} />
                <button
                  type="submit"
                  className="rounded-md border border-slate-700 px-2 py-1 text-xs hover:bg-red-950"
                >
                  Unbind
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
