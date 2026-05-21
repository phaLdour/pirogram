import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { log } from "@/lib/log";

export type DriverEvent =
  | { kind: "claude-comment-created"; body: string; at: Date }
  | { kind: "user-comment-created" }
  | { kind: "pr-merged-closes-issue" }
  | { kind: "workflow-failed" };

type CurrentStatus =
  | "NOT_DRIVING"
  | "REQUESTED"
  | "RUNNING"
  | "AWAITING_USER"
  | "COMPLETED"
  | "FAILED";

/**
 * Pure state transition: given the current driverStatus and the next driver
 * event, return the new driverStatus. Exported for unit tests.
 */
export function nextStatus(current: CurrentStatus, event: DriverEvent): CurrentStatus {
  // Once terminal, stay terminal.
  if (current === "COMPLETED" || current === "FAILED") return current;

  switch (event.kind) {
    case "claude-comment-created":
      // Cheap heuristic: a comment ending with `?` is treated as a pending
      // question the user must answer. Comments that don't end with `?`
      // mean Claude is still working autonomously.
      if (looksLikeQuestion(event.body)) return "AWAITING_USER";
      // First claude comment after REQUESTED flips us to RUNNING.
      if (current === "REQUESTED") return "RUNNING";
      return "RUNNING";
    case "user-comment-created":
      // User just replied → Claude will resume.
      return "RUNNING";
    case "pr-merged-closes-issue":
      return "COMPLETED";
    case "workflow-failed":
      return "FAILED";
  }
}

function looksLikeQuestion(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed) return false;
  // Strip trailing whitespace + markdown like "</details>" closing tags
  // so a comment that ends with a question followed by hidden metadata
  // still registers.
  const lastChar = trimmed[trimmed.length - 1];
  return lastChar === "?";
}

/**
 * Inspect a GitHub webhook event after the projection step has run and,
 * if it concerns a sprint driver issue, advance the sprint's driverStatus.
 *
 * Safe to call for any event — returns silently when nothing matches.
 */
export async function advanceDriverFromEvent(args: {
  repoId: string;
  eventName: string;
  payload: Prisma.InputJsonValue;
}): Promise<void> {
  const { eventName, payload, repoId } = args;

  // Narrow by event type. We only care about three kinds.
  if (
    eventName !== "issue_comment" &&
    eventName !== "pull_request" &&
    eventName !== "workflow_run"
  ) {
    return;
  }

  const p = payload as Record<string, unknown>;

  if (eventName === "issue_comment") {
    if (p.action !== "created") return;
    const issue = (p.issue as Record<string, unknown> | undefined) ?? {};
    const labels =
      ((issue.labels as Array<{ name: string }> | undefined) ?? []).map((l) => l.name) ?? [];
    if (!labels.includes("agentwatch-driven")) return;
    const issueNumber = issue.number as number | undefined;
    if (typeof issueNumber !== "number") return;

    const sprint = await prisma.sprint.findFirst({
      where: { driverRepoId: repoId, driverIssueNumber: issueNumber },
      select: { id: true, driverStatus: true },
    });
    if (!sprint) return;

    const sender = (p.sender as Record<string, unknown> | undefined) ?? {};
    const comment = (p.comment as Record<string, unknown> | undefined) ?? {};
    const body = (comment.body as string | undefined) ?? "";
    const isClaude = sender.type === "Bot" || /claude/i.test((sender.login as string) ?? "");

    const event: DriverEvent = isClaude
      ? { kind: "claude-comment-created", body, at: new Date() }
      : { kind: "user-comment-created" };

    const next = nextStatus(sprint.driverStatus as CurrentStatus, event);
    if (next !== sprint.driverStatus) {
      await prisma.sprint.update({
        where: { id: sprint.id },
        data: { driverStatus: next },
      });
      log.info("sprint.driver-status-changed", {
        sprintId: sprint.id,
        from: sprint.driverStatus,
        to: next,
        trigger: event.kind,
      });
    }
    return;
  }

  if (eventName === "pull_request") {
    if (p.action !== "closed") return;
    const pr = (p.pull_request as Record<string, unknown> | undefined) ?? {};
    if (pr.merged !== true) return;
    const body = (pr.body as string | undefined) ?? "";
    // Find `Closes #N` / `Fixes #N` / `Resolves #N` references.
    const matches = [...body.matchAll(/\b(?:closes|fixes|resolves)\s+#(\d+)\b/gi)];
    if (matches.length === 0) return;
    const issueNumbers = matches.map((m) => Number(m[1])).filter((n) => Number.isFinite(n));

    const sprints = await prisma.sprint.findMany({
      where: { driverRepoId: repoId, driverIssueNumber: { in: issueNumbers } },
      select: { id: true, driverStatus: true },
    });
    for (const sprint of sprints) {
      const next = nextStatus(sprint.driverStatus as CurrentStatus, {
        kind: "pr-merged-closes-issue",
      });
      if (next !== sprint.driverStatus) {
        await prisma.sprint.update({
          where: { id: sprint.id },
          data: { driverStatus: next },
        });
        log.info("sprint.driver-status-changed", {
          sprintId: sprint.id,
          from: sprint.driverStatus,
          to: next,
          trigger: "pr-merged-closes-issue",
        });
      }
    }
    return;
  }

  if (eventName === "workflow_run") {
    if (p.action !== "completed") return;
    const run = (p.workflow_run as Record<string, unknown> | undefined) ?? {};
    if (run.conclusion !== "failure") return;
    // We can't tell from the payload alone which driver issue this run
    // belonged to. We only mark FAILED on sprints whose driverStatus is
    // currently REQUESTED or RUNNING for this repo and which have no PR
    // merged yet — a cheap-and-honest approximation.
    const sprints = await prisma.sprint.findMany({
      where: {
        driverRepoId: repoId,
        driverStatus: { in: ["REQUESTED", "RUNNING", "AWAITING_USER"] },
      },
      select: { id: true, driverStatus: true },
    });
    for (const sprint of sprints) {
      const next = nextStatus(sprint.driverStatus as CurrentStatus, {
        kind: "workflow-failed",
      });
      if (next !== sprint.driverStatus) {
        await prisma.sprint.update({
          where: { id: sprint.id },
          data: { driverStatus: next },
        });
        log.info("sprint.driver-status-changed", {
          sprintId: sprint.id,
          from: sprint.driverStatus,
          to: next,
          trigger: "workflow-failed",
        });
      }
    }
    return;
  }
}
