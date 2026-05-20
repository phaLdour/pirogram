import type { AgentEvent } from "@/lib/webhook/schema";

// We intentionally use a narrow structural read of GitHub payloads rather than
// the full @octokit/webhooks-types — those types are very large and only a
// handful of fields are needed. Octokit types are used in tests as type-level
// fixtures (`Parameters<…>`) to keep field names honest.

type GhUser = { login?: string | null } | null | undefined;
type GhRepoRef = { full_name?: string | null } | undefined;

type PushCommit = {
  id: string;
  message: string;
  author?: { name?: string | null; username?: string | null; email?: string | null } | null;
  timestamp?: string | null;
};

type PushPayload = {
  ref?: string;
  after?: string;
  repository?: GhRepoRef;
  commits?: PushCommit[];
  pusher?: { name?: string | null } | null;
};

type PullRequestPayload = {
  action: string;
  pull_request: {
    number: number;
    title: string;
    body?: string | null;
    merged?: boolean;
    user?: GhUser;
    created_at?: string | null;
    closed_at?: string | null;
    updated_at?: string | null;
  };
  repository?: GhRepoRef;
};

type IssuesPayload = {
  action: string;
  issue: {
    number: number;
    title: string;
    body?: string | null;
    user?: GhUser;
    assignee?: GhUser;
    created_at?: string | null;
    closed_at?: string | null;
    updated_at?: string | null;
  };
  repository?: GhRepoRef;
};

type WorkflowRunPayload = {
  action: string;
  workflow_run: {
    name?: string | null;
    conclusion?: string | null;
    status?: string | null;
    head_branch?: string | null;
    html_url?: string | null;
    updated_at?: string | null;
    actor?: GhUser;
    triggering_actor?: GhUser;
  };
  repository?: GhRepoRef;
};

export type TranslateContext = {
  /** Stable per-delivery prefix; the translator appends an index to make event IDs unique. */
  deliveryId: string;
  /** Repo identifier used in synthesized task IDs (e.g. "owner/repo/PR-12"). */
  repoSlug: string;
  /** Fallback ISO timestamp when payload omits one. */
  now: Date;
};

export type TranslateResult = {
  events: AgentEvent[];
  /** True when the GitHub event type is supported but produced no AgentEvents (e.g. workflow_run success). */
  recognized: boolean;
};

const CONVENTIONAL_PREFIX = /^(feat|fix|chore|refactor|docs|test|perf|style|build|ci)(\(.+\))?!?:/i;

function isoOf(value: string | null | undefined, fallback: Date): string {
  if (!value) return fallback.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback.toISOString() : d.toISOString();
}

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function firstLine(message: string): string {
  const idx = message.indexOf("\n");
  return idx === -1 ? message : message.slice(0, idx);
}

function eventId(ctx: TranslateContext, index: number): string {
  // Deterministic UUID v5-ish identifier without bringing in a uuid lib: the
  // schema already enforces uuid() format. Use a synthetic UUID that embeds
  // the delivery hash so re-deliveries collide on EventLog.eventId.
  const hex = hashHex(`${ctx.deliveryId}:${index}`);
  // Format as 8-4-4-4-12; force the version nibble to 4 and the variant to 8.
  const part1 = hex.slice(0, 8);
  const part2 = hex.slice(8, 12);
  const part3 = "4" + hex.slice(13, 16);
  const part4 = "8" + hex.slice(17, 20);
  const part5 = hex.slice(20, 32);
  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}

// Small FNV-1a 128-bit (folded) — sufficient for collision-resistant per-delivery IDs.
function hashHex(input: string): string {
  // Use a 64-bit FNV-1a, then duplicate to fill 32 hex chars. Good enough as
  // we only need uniqueness within (delivery, index) tuples.
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  const a = hash.toString(16).padStart(16, "0");
  // Second pass on reversed input for a second 64-bit value to fill the UUID.
  let hash2 = 0xcbf29ce484222325n;
  for (let i = input.length - 1; i >= 0; i--) {
    hash2 ^= BigInt(input.charCodeAt(i));
    hash2 = (hash2 * prime) & 0xffffffffffffffffn;
  }
  const b = hash2.toString(16).padStart(16, "0");
  return (a + b).slice(0, 32);
}

export function translateGithubEvent(
  eventName: string,
  payload: unknown,
  ctx: TranslateContext,
): TranslateResult {
  switch (eventName) {
    case "push":
      return { events: translatePush(payload as PushPayload, ctx), recognized: true };
    case "pull_request":
      return { events: translatePullRequest(payload as PullRequestPayload, ctx), recognized: true };
    case "issues":
      return { events: translateIssues(payload as IssuesPayload, ctx), recognized: true };
    case "workflow_run":
      return { events: translateWorkflowRun(payload as WorkflowRunPayload, ctx), recognized: true };
    case "ping":
      return { events: [], recognized: true };
    default:
      return { events: [], recognized: false };
  }
}

function translatePush(p: PushPayload, ctx: TranslateContext): AgentEvent[] {
  const commits = p.commits ?? [];
  const out: AgentEvent[] = [];
  commits.forEach((commit, i) => {
    const from =
      commit.author?.username?.trim() ||
      commit.author?.name?.trim() ||
      p.pusher?.name?.trim() ||
      "unknown";
    const at = isoOf(commit.timestamp, ctx.now);
    const msgLine = firstLine(commit.message);

    out.push({
      type: "Message",
      eventId: eventId(ctx, i * 2),
      at,
      from,
      body: commit.message,
    } as AgentEvent);

    if (CONVENTIONAL_PREFIX.test(msgLine.trim())) {
      out.push({
        type: "TaskCreated",
        eventId: eventId(ctx, i * 2 + 1),
        at,
        task: {
          id: `${ctx.repoSlug}/COMMIT-${shortSha(commit.id)}`,
          title: msgLine.trim(),
          assignee: from,
        },
      } as AgentEvent);
    }
  });
  return out;
}

function translatePullRequest(p: PullRequestPayload, ctx: TranslateContext): AgentEvent[] {
  const { action, pull_request: pr } = p;
  const taskId = `${ctx.repoSlug}/PR-${pr.number}`;
  const author = pr.user?.login?.trim() || "unknown";

  if (action === "opened" || action === "reopened") {
    return [
      {
        type: "TaskCreated",
        eventId: eventId(ctx, 0),
        at: isoOf(pr.created_at ?? pr.updated_at, ctx.now),
        task: {
          id: taskId,
          title: pr.title,
          ...(pr.body ? { description: pr.body } : {}),
          assignee: author,
        },
      } as AgentEvent,
    ];
  }

  if (action === "closed") {
    return [
      {
        type: "TaskCompleted",
        eventId: eventId(ctx, 0),
        at: isoOf(pr.closed_at ?? pr.updated_at, ctx.now),
        taskId,
      } as AgentEvent,
    ];
  }

  return [];
}

function translateIssues(p: IssuesPayload, ctx: TranslateContext): AgentEvent[] {
  const { action, issue } = p;
  const taskId = `${ctx.repoSlug}/ISSUE-${issue.number}`;
  const author = issue.assignee?.login?.trim() || issue.user?.login?.trim() || "unknown";

  if (action === "opened" || action === "reopened") {
    return [
      {
        type: "TaskCreated",
        eventId: eventId(ctx, 0),
        at: isoOf(issue.created_at ?? issue.updated_at, ctx.now),
        task: {
          id: taskId,
          title: issue.title,
          ...(issue.body ? { description: issue.body } : {}),
          assignee: author,
        },
      } as AgentEvent,
    ];
  }

  if (action === "closed") {
    return [
      {
        type: "TaskCompleted",
        eventId: eventId(ctx, 0),
        at: isoOf(issue.closed_at ?? issue.updated_at, ctx.now),
        taskId,
      } as AgentEvent,
    ];
  }

  return [];
}

function translateWorkflowRun(p: WorkflowRunPayload, ctx: TranslateContext): AgentEvent[] {
  if (p.action !== "completed") return [];
  const { workflow_run: run } = p;
  if (run.conclusion !== "failure") return [];

  const from =
    run.triggering_actor?.login?.trim() || run.actor?.login?.trim() || "github-actions";
  const body = `CI failed: ${run.name ?? "workflow"}${
    run.head_branch ? ` on ${run.head_branch}` : ""
  }`;
  return [
    {
      type: "Message",
      eventId: eventId(ctx, 0),
      at: isoOf(run.updated_at, ctx.now),
      from,
      body,
    } as AgentEvent,
  ];
}
