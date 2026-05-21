"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { bumpVersion, detectBump, formatChangelogMarkdown, type Bump } from "@/lib/sprints";

export type StartSprintResult = { ok: true; id: string } | { ok: false; error: string };

export async function startSprint(formData: FormData): Promise<StartSprintResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "unauthorized" };

  const name = String(formData.get("name") ?? "").trim();
  const goal = String(formData.get("goal") ?? "").trim();
  if (!name) return { ok: false, error: "name-required" };
  if (name.length > 80) return { ok: false, error: "name-too-long" };

  const existing = await prisma.sprint.findFirst({ where: { status: "ACTIVE" } });
  if (existing) return { ok: false, error: "active-sprint-exists" };

  const sprint = await prisma.sprint.create({
    data: { name, goal: goal || null, status: "ACTIVE" },
  });

  revalidatePath("/");
  revalidatePath("/sprints");
  return { ok: true, id: sprint.id };
}

export type EndSprintResult = { ok: true; id: string; version: string } | { ok: false; error: string };

function parseBump(raw: FormDataEntryValue | null): Bump | "auto" {
  const v = String(raw ?? "auto").toLowerCase();
  if (v === "major" || v === "minor" || v === "patch" || v === "auto") return v;
  return "auto";
}

export async function endSprint(formData: FormData): Promise<EndSprintResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "unauthorized" };

  const id = String(formData.get("id") ?? "");
  const bumpChoice = parseBump(formData.get("bump"));
  if (!id) return { ok: false, error: "id-required" };

  const sprint = await prisma.sprint.findUnique({ where: { id } });
  if (!sprint) return { ok: false, error: "not-found" };
  if (sprint.status !== "ACTIVE") return { ok: false, error: "not-active" };

  const doneTasks = await prisma.task.findMany({
    where: { sprintId: id, status: "DONE" },
    orderBy: { completedAt: "asc" },
  });

  const lastVersionedSprint = await prisma.sprint.findFirst({
    where: { status: "COMPLETED", version: { not: null } },
    orderBy: { endedAt: "desc" },
  });

  const bump = detectBump(doneTasks, bumpChoice);
  const version = bumpVersion(lastVersionedSprint?.version ?? null, bump);
  const endedAt = new Date();
  const changelog = formatChangelogMarkdown(
    { name: sprint.name, version, startedAt: sprint.startedAt, endedAt },
    doneTasks,
  );

  await prisma.sprint.update({
    where: { id },
    data: { status: "COMPLETED", endedAt, version, changelog },
  });

  revalidatePath("/");
  revalidatePath("/sprints");
  revalidatePath(`/sprints/${id}`);
  return { ok: true, id, version };
}

export async function viewSprint(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  redirect(`/sprints/${id}`);
}

export type EnableClaudeResult = { ok: true } | { ok: false; error: string };

export async function enableClaudeOnSprint(formData: FormData): Promise<EnableClaudeResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "unauthorized" };
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "id-required" };

  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "anthropic-not-configured" };
  }

  await prisma.sprint.update({ where: { id }, data: { claudeEnabled: true } });
  revalidatePath(`/sprints/${id}`);
  return { ok: true };
}

export type ClaudeChatResult =
  | { ok: true; reply: string; tasksProposed: string[] }
  | { ok: false; error: string };

export async function claudeChat(formData: FormData): Promise<ClaudeChatResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "unauthorized" };
  const id = String(formData.get("sprintId") ?? "");
  const message = String(formData.get("message") ?? "").trim();
  if (!id) return { ok: false, error: "sprintId-required" };
  if (!message) return { ok: false, error: "message-required" };
  if (message.length > 8000) return { ok: false, error: "message-too-long" };

  const { driveSprintTurn } = await import("@/lib/claude-driver");
  const result = await driveSprintTurn(id, message);
  if (result.ok) revalidatePath(`/sprints/${id}`);
  return result;
}

export type DriveResult =
  | { ok: true; issueNumber: number; issueUrl: string }
  | { ok: false; error: string };

export async function driveSprintOnGitHub(formData: FormData): Promise<DriveResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "unauthorized" };
  const sprintId = String(formData.get("sprintId") ?? "");
  const repoId = String(formData.get("repoId") ?? "");
  if (!sprintId || !repoId) return { ok: false, error: "missing-fields" };

  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!sprint) return { ok: false, error: "sprint-not-found" };
  if (sprint.status !== "ACTIVE") return { ok: false, error: "sprint-not-active" };
  if (sprint.driverIssueNumber) return { ok: false, error: "already-driving" };

  const repo = await prisma.repo.findUnique({ where: { id: repoId } });
  if (!repo || repo.revokedAt) return { ok: false, error: "repo-not-bound" };

  const { getGithubAccount } = await import("@/lib/github-token");
  const { GitHubApiError, createIssue, hasRequiredScopes } = await import("@/lib/github");
  const account = await getGithubAccount(session.user.id);
  if (!account) return { ok: false, error: "no-github-account" };
  if (!hasRequiredScopes(account.scope)) return { ok: false, error: "scope-insufficient" };

  const title = `[AgentWatch] ${sprint.name}`;
  const body = [
    "@claude",
    "",
    sprint.goal ?? "(no goal specified)",
    "",
    "---",
    "_Driven by AgentWatch. Reply with `@claude <message>` to continue the conversation._",
  ].join("\n");

  let issueNumber: number;
  let issueUrl: string;
  try {
    const issue = await createIssue(account.accessToken, repo.fullName, {
      title,
      body,
      labels: ["agentwatch-driven"],
    });
    issueNumber = issue.number;
    issueUrl = issue.htmlUrl;
  } catch (err) {
    const kind = err instanceof GitHubApiError ? err.kind : "unknown";
    return { ok: false, error: `github-${kind}` };
  }

  await prisma.sprint.update({
    where: { id: sprintId },
    data: {
      driverRepoId: repo.id,
      driverIssueNumber: issueNumber,
      driverIssueUrl: issueUrl,
      driverStatus: "REQUESTED",
      driverMode: "AUTO_ACTION",
    },
  });

  revalidatePath(`/sprints/${sprintId}`);
  return { ok: true, issueNumber, issueUrl };
}

export type HandoffResult =
  | {
      ok: true;
      issueNumber: number;
      issueUrl: string;
      prompt: string;
      deepLink: string;
    }
  | { ok: false; error: string };

/**
 * Free-mode counterpart to driveSprintOnGitHub. Opens a GitHub issue with the
 * sprint description but DOES NOT include `@claude` — the
 * anthropics/claude-code-action workflow won't fire, so no Anthropic tokens
 * are spent. The user opens claude.ai/code themselves under their Pro
 * subscription using the prompt we return.
 */
export async function handoffToClaudeCode(formData: FormData): Promise<HandoffResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "unauthorized" };
  const sprintId = String(formData.get("sprintId") ?? "");
  const repoId = String(formData.get("repoId") ?? "");
  if (!sprintId || !repoId) return { ok: false, error: "missing-fields" };

  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!sprint) return { ok: false, error: "sprint-not-found" };
  if (sprint.status !== "ACTIVE") return { ok: false, error: "sprint-not-active" };
  if (sprint.driverIssueNumber) return { ok: false, error: "already-driving" };

  const repo = await prisma.repo.findUnique({ where: { id: repoId } });
  if (!repo || repo.revokedAt) return { ok: false, error: "repo-not-bound" };

  const { getGithubAccount } = await import("@/lib/github-token");
  const { GitHubApiError, createIssue, hasRequiredScopes } = await import("@/lib/github");
  const account = await getGithubAccount(session.user.id);
  if (!account) return { ok: false, error: "no-github-account" };
  if (!hasRequiredScopes(account.scope)) return { ok: false, error: "scope-insufficient" };

  const title = `[AgentWatch] ${sprint.name}`;
  const goal = sprint.goal ?? "(no goal specified)";
  const body = [
    "## Sprint hand-off from AgentWatch",
    "",
    `**Sprint:** ${sprint.name}`,
    "**Goal:**",
    "",
    goal,
    "",
    "---",
    "",
    "_This issue was opened by AgentWatch as a hand-off to Claude Code._",
    "_Open this repo in Claude Code (Pro plan) to work the task — AgentWatch will track commits and PRs that reference this issue (e.g. `Closes #N`)._",
  ].join("\n");

  // Sanity guard: hand-off body MUST NOT contain @claude — otherwise the
  // user's auto-action workflow would fire and start spending tokens.
  if (/@claude\b/.test(body)) {
    return { ok: false, error: "handoff-anti-trigger-failed" };
  }

  let issueNumber: number;
  let issueUrl: string;
  try {
    const issue = await createIssue(account.accessToken, repo.fullName, {
      title,
      body,
      labels: ["agentwatch-driven"],
    });
    issueNumber = issue.number;
    issueUrl = issue.htmlUrl;
  } catch (err) {
    const kind = err instanceof GitHubApiError ? err.kind : "unknown";
    return { ok: false, error: `github-${kind}` };
  }

  await prisma.sprint.update({
    where: { id: sprintId },
    data: {
      driverRepoId: repo.id,
      driverIssueNumber: issueNumber,
      driverIssueUrl: issueUrl,
      driverStatus: "REQUESTED",
      driverMode: "HANDOFF",
    },
  });

  // Promptu kullaıcı clipboard'a kopyalayabilsin diye / Claude Code'da yeni
  // session başlatırken pencerede ne paste edeceğini bildirsin diye, server
  // tarafında düzgün formatla.
  const prompt = [
    `You are working on the GitHub repository ${repo.fullName}.`,
    "",
    "AgentWatch handed you this sprint to execute:",
    "",
    `Sprint name: ${sprint.name}`,
    "Goal:",
    goal,
    "",
    `When you open the pull request, include "Closes #${issueNumber}" in the body so AgentWatch can detect completion. Reference issue: ${issueUrl}`,
  ].join("\n");

  // Best-effort deep link. Whether claude.ai honors `?q=` is uncertain; the
  // UI also exposes a "Copy prompt" button as a guaranteed fallback.
  const deepLink = `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;

  revalidatePath(`/sprints/${sprintId}`);
  return { ok: true, issueNumber, issueUrl, prompt, deepLink };
}

export type ReplyResult = { ok: true } | { ok: false; error: string };

export async function replyToDriver(formData: FormData): Promise<ReplyResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "unauthorized" };
  const sprintId = String(formData.get("sprintId") ?? "");
  const messageRaw = String(formData.get("message") ?? "").trim();
  if (!sprintId) return { ok: false, error: "sprintId-required" };
  if (!messageRaw) return { ok: false, error: "message-required" };
  if (messageRaw.length > 8000) return { ok: false, error: "message-too-long" };

  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    include: { driver: true },
  });
  if (!sprint || !sprint.driver || !sprint.driverIssueNumber) {
    return { ok: false, error: "not-driving" };
  }

  const { getGithubAccount } = await import("@/lib/github-token");
  const { GitHubApiError, createIssueComment, hasRequiredScopes } = await import("@/lib/github");
  const account = await getGithubAccount(session.user.id);
  if (!account || !hasRequiredScopes(account.scope)) {
    return { ok: false, error: "scope-insufficient" };
  }

  // Prefix with @claude (unless the user already did) so the workflow's
  // `contains(comment.body, '@claude')` guard fires.
  const body = /@claude\b/.test(messageRaw) ? messageRaw : `@claude ${messageRaw}`;

  try {
    await createIssueComment(
      account.accessToken,
      sprint.driver.fullName,
      sprint.driverIssueNumber,
      body,
    );
  } catch (err) {
    const kind = err instanceof GitHubApiError ? err.kind : "unknown";
    return { ok: false, error: `github-${kind}` };
  }

  // Optimistic state nudge — webhook handler will reconcile on the real event.
  await prisma.sprint.update({
    where: { id: sprintId },
    data: { driverStatus: "RUNNING" },
  });

  revalidatePath(`/sprints/${sprintId}`);
  return { ok: true };
}

export async function stopDriving(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) return;
  const sprintId = String(formData.get("sprintId") ?? "");
  if (!sprintId) return;
  await prisma.sprint.update({
    where: { id: sprintId },
    data: { driverStatus: "COMPLETED" },
  });
  revalidatePath(`/sprints/${sprintId}`);
}
