import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EndSprintForm } from "@/components/sprints/EndSprintForm";
import { ClaudeRunPanel, type ClaudeMessageVM } from "@/components/sprints/ClaudeRunPanel";
import { RunSprintTabs } from "@/components/sprints/RunSprintTabs";
import type { DriverMessage, RepoOption } from "@/components/sprints/DriveOnGitHubPanel";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 16).replace("T", " ") : "—";
}

export default async function SprintDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const { id } = await params;
  const sprint = await prisma.sprint.findUnique({
    where: { id },
    include: {
      tasks: { orderBy: [{ status: "asc" }, { completedAt: "desc" }] },
      claudeMessages: { orderBy: { createdAt: "asc" } },
      driver: true,
    },
  });
  if (!sprint) notFound();

  const doneCount = sprint.tasks.filter((t) => t.status === "DONE").length;
  const claudeMessages: ClaudeMessageVM[] = sprint.claudeMessages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    tokensIn: m.tokensIn,
    tokensOut: m.tokensOut,
    tokensCacheR: m.tokensCacheR,
  }));

  let driverMessages: DriverMessage[] = [];
  let bindableRepos: RepoOption[] = [];
  if (sprint.status === "ACTIVE") {
    if (sprint.driverIssueNumber && sprint.driver) {
      const driverTaskId = `${sprint.driver.fullName}/ISSUE-${sprint.driverIssueNumber}`;
      const messages = await prisma.message.findMany({
        where: { taskId: driverTaskId },
        orderBy: { createdAt: "asc" },
        take: 200,
        include: { from: { select: { name: true } } },
      });
      driverMessages = messages.map((m) => ({
        id: m.id,
        fromName: m.from.name,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        isBot: /\bbot\b/i.test(m.from.name) || /claude/i.test(m.from.name),
      }));
    } else {
      const repos = await prisma.repo.findMany({
        where: { revokedAt: null },
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true },
      });
      bindableRepos = repos;
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/sprints"
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            ← All sprints
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            {sprint.version ? (
              <span className="mr-2 rounded bg-slate-800 px-2 py-0.5 align-middle font-mono text-base">
                {sprint.version}
              </span>
            ) : null}
            {sprint.name}
          </h1>
          {sprint.goal && <p className="mt-1 text-sm text-slate-400">{sprint.goal}</p>}
          <p className="mt-1 text-xs text-slate-500">
            {fmtDate(sprint.startedAt)} → {fmtDate(sprint.endedAt)} · {doneCount}/
            {sprint.tasks.length} done · status {sprint.status.toLowerCase()}
          </p>
        </div>
        {sprint.status === "ACTIVE" && <EndSprintForm sprintId={sprint.id} />}
      </header>

      {sprint.status === "ACTIVE" && (
        <RunSprintTabs
          sprintId={sprint.id}
          driverMode={sprint.driverMode}
          driverStatus={sprint.driverStatus}
          driverIssueUrl={sprint.driverIssueUrl}
          driverRepoFullName={sprint.driver?.fullName ?? null}
          bindableRepos={bindableRepos}
          messages={driverMessages}
          prefilledPrompt={null}
        />
      )}

      {sprint.status === "ACTIVE" && (
        <details className="rounded-md border border-slate-800 bg-slate-900/40">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-300">
            Planning copilot (refine the goal before driving on GitHub)
          </summary>
          <div className="border-t border-slate-800 p-4">
            <ClaudeRunPanel
              sprintId={sprint.id}
              enabled={sprint.claudeEnabled}
              messages={claudeMessages}
            />
          </div>
        </details>
      )}

      {sprint.changelog ? (
        <section className="rounded-md border border-slate-800 bg-slate-900/40 p-4">
          <h2 className="text-sm font-semibold text-slate-300">Changelog</h2>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-sm text-slate-200">
            {sprint.changelog}
          </pre>
        </section>
      ) : (
        <section>
          <h2 className="text-sm font-semibold text-slate-300">Tasks</h2>
          <ul className="mt-2 space-y-1">
            {sprint.tasks.length === 0 ? (
              <li className="text-sm text-slate-500">
                No tasks in this sprint yet. New TaskCreated events auto-attach.
              </li>
            ) : (
              sprint.tasks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded border border-slate-800 px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-mono text-xs text-slate-500">{t.id}</span>{" "}
                    <span>{t.title}</span>
                  </span>
                  <span className="text-xs text-slate-500">{t.status.toLowerCase()}</span>
                </li>
              ))
            )}
          </ul>
        </section>
      )}
    </main>
  );
}
