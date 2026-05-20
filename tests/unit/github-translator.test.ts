import { describe, expect, it } from "vitest";
import { translateGithubEvent, type TranslateContext } from "@/lib/webhook/github-translator";

const ctx: TranslateContext = {
  deliveryId: "11111111-1111-1111-1111-111111111111",
  repoSlug: "phaLdour/english4kids",
  now: new Date("2026-05-20T12:00:00.000Z"),
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("translateGithubEvent — push", () => {
  it("emits a Message per commit and a TaskCreated when the message is a conventional commit", () => {
    const payload = {
      ref: "refs/heads/main",
      repository: { full_name: ctx.repoSlug },
      pusher: { name: "alice" },
      commits: [
        {
          id: "abcdef0123456789",
          message: "feat: add live agents",
          author: { username: "alice", name: "Alice", email: "a@example.com" },
          timestamp: "2026-05-20T11:00:00Z",
        },
        {
          id: "deadbeef00000000",
          message: "wip: not yet",
          author: { username: "bob" },
          timestamp: "2026-05-20T11:05:00Z",
        },
      ],
    };

    const { events, recognized } = translateGithubEvent("push", payload, ctx);
    expect(recognized).toBe(true);
    expect(events).toHaveLength(3);
    expect(events[0]?.type).toBe("Message");
    expect(events[1]?.type).toBe("TaskCreated");
    expect(events[2]?.type).toBe("Message");
    for (const e of events) {
      expect(e.eventId).toMatch(UUID_RE);
    }
    if (events[1]?.type === "TaskCreated") {
      expect(events[1].task.id).toBe("phaLdour/english4kids/COMMIT-abcdef0");
      expect(events[1].task.title).toBe("feat: add live agents");
      expect(events[1].task.assignee).toBe("alice");
    }
  });

  it("falls back to pusher.name when commit author is missing", () => {
    const payload = {
      repository: { full_name: ctx.repoSlug },
      pusher: { name: "alice" },
      commits: [{ id: "1234567abcdefg0", message: "fix things", author: null }],
    };
    const { events } = translateGithubEvent("push", payload, ctx);
    expect(events).toHaveLength(1);
    if (events[0]?.type === "Message") expect(events[0].from).toBe("alice");
  });
});

describe("translateGithubEvent — pull_request", () => {
  const base = {
    repository: { full_name: ctx.repoSlug },
    pull_request: {
      number: 12,
      title: "feat: dashboard live cards",
      body: "Closes #5",
      user: { login: "alice" },
      created_at: "2026-05-19T09:00:00Z",
      closed_at: null as string | null,
      merged: false,
    },
  };

  it("opened → TaskCreated with namespaced id", () => {
    const { events } = translateGithubEvent("pull_request", { ...base, action: "opened" }, ctx);
    expect(events).toHaveLength(1);
    if (events[0]?.type === "TaskCreated") {
      expect(events[0].task.id).toBe("phaLdour/english4kids/PR-12");
      expect(events[0].task.assignee).toBe("alice");
    }
  });

  it("closed merged → TaskCompleted", () => {
    const payload = {
      ...base,
      action: "closed",
      pull_request: { ...base.pull_request, merged: true, closed_at: "2026-05-20T10:00:00Z" },
    };
    const { events } = translateGithubEvent("pull_request", payload, ctx);
    expect(events).toHaveLength(1);
    if (events[0]?.type === "TaskCompleted") {
      expect(events[0].taskId).toBe("phaLdour/english4kids/PR-12");
    }
  });

  it("closed unmerged → still TaskCompleted (CANCELLED maps to Sprint 7)", () => {
    const payload = { ...base, action: "closed" };
    const { events } = translateGithubEvent("pull_request", payload, ctx);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("TaskCompleted");
  });

  it("synchronize / labeled actions are no-ops", () => {
    const payload = { ...base, action: "synchronize" };
    const result = translateGithubEvent("pull_request", payload, ctx);
    expect(result.recognized).toBe(true);
    expect(result.events).toHaveLength(0);
  });
});

describe("translateGithubEvent — issues", () => {
  const base = {
    repository: { full_name: ctx.repoSlug },
    issue: {
      number: 7,
      title: "auth callback 404",
      user: { login: "alice" },
      assignee: null,
      created_at: "2026-05-18T08:00:00Z",
      closed_at: null as string | null,
    },
  };

  it("opened → TaskCreated assigned to issue.user when assignee missing", () => {
    const { events } = translateGithubEvent("issues", { ...base, action: "opened" }, ctx);
    expect(events).toHaveLength(1);
    if (events[0]?.type === "TaskCreated") {
      expect(events[0].task.id).toBe("phaLdour/english4kids/ISSUE-7");
      expect(events[0].task.assignee).toBe("alice");
    }
  });

  it("closed → TaskCompleted", () => {
    const payload = {
      ...base,
      action: "closed",
      issue: { ...base.issue, closed_at: "2026-05-20T10:00:00Z" },
    };
    const { events } = translateGithubEvent("issues", payload, ctx);
    expect(events[0]?.type).toBe("TaskCompleted");
  });
});

describe("translateGithubEvent — workflow_run", () => {
  it("failure → single Message describing the failed run", () => {
    const payload = {
      action: "completed",
      repository: { full_name: ctx.repoSlug },
      workflow_run: {
        name: "CI",
        conclusion: "failure",
        head_branch: "main",
        triggering_actor: { login: "alice" },
        updated_at: "2026-05-20T12:01:00Z",
      },
    };
    const { events } = translateGithubEvent("workflow_run", payload, ctx);
    expect(events).toHaveLength(1);
    if (events[0]?.type === "Message") {
      expect(events[0].from).toBe("alice");
      expect(events[0].body).toBe("CI failed: CI on main");
    }
  });

  it("success → empty (we don't spam the feed)", () => {
    const payload = {
      action: "completed",
      workflow_run: { conclusion: "success" },
    };
    const result = translateGithubEvent("workflow_run", payload, ctx);
    expect(result.recognized).toBe(true);
    expect(result.events).toHaveLength(0);
  });
});

describe("translateGithubEvent — unknown / ping", () => {
  it("ping → recognized, no events", () => {
    const result = translateGithubEvent("ping", {}, ctx);
    expect(result.recognized).toBe(true);
    expect(result.events).toHaveLength(0);
  });

  it("unknown event → not recognized, no events", () => {
    const result = translateGithubEvent("star", {}, ctx);
    expect(result.recognized).toBe(false);
    expect(result.events).toHaveLength(0);
  });
});

describe("eventId determinism", () => {
  it("the same delivery + index yields the same eventId across calls", () => {
    const payload = {
      repository: { full_name: ctx.repoSlug },
      commits: [{ id: "aaaaaaaa", message: "fix: bug", author: { username: "x" } }],
    };
    const a = translateGithubEvent("push", payload, ctx).events;
    const b = translateGithubEvent("push", payload, ctx).events;
    expect(a.map((e) => e.eventId)).toEqual(b.map((e) => e.eventId));
  });
});
