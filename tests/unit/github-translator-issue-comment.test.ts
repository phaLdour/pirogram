import { describe, expect, it } from "vitest";
import { translateGithubEvent, type TranslateContext } from "@/lib/webhook/github-translator";

const ctx: TranslateContext = {
  deliveryId: "44444444-4444-4444-4444-444444444444",
  repoSlug: "alice/foo",
  now: new Date("2026-05-21T08:00:00.000Z"),
};

const baseDriverIssue = {
  number: 17,
  title: "[AgentWatch] feat: dashboard",
  labels: [{ name: "agentwatch-driven" }],
};

describe("translateGithubEvent — issue_comment", () => {
  it("claude[bot] comment on a driver issue → Message tagged to the issue", () => {
    const { events, recognized } = translateGithubEvent(
      "issue_comment",
      {
        action: "created",
        issue: baseDriverIssue,
        comment: { body: "Starting the work.", created_at: "2026-05-21T08:01:00Z" },
        sender: { login: "claude[bot]", type: "Bot" },
      },
      ctx,
    );
    expect(recognized).toBe(true);
    expect(events).toHaveLength(1);
    if (events[0]?.type === "Message") {
      expect(events[0].from).toBe("claude[bot]");
      expect(events[0].body).toBe("Starting the work.");
      expect(events[0].taskId).toBe("alice/foo/ISSUE-17");
    }
  });

  it("human comment on a driver issue → Message (so the reply shows in the transcript)", () => {
    const { events } = translateGithubEvent(
      "issue_comment",
      {
        action: "created",
        issue: baseDriverIssue,
        comment: { body: "@claude use sqlite please", created_at: "2026-05-21T08:05:00Z" },
        sender: { login: "alice", type: "User" },
      },
      ctx,
    );
    expect(events).toHaveLength(1);
    if (events[0]?.type === "Message") {
      expect(events[0].from).toBe("alice");
    }
  });

  it("human comment on a NON-driver issue → no event (noise filter)", () => {
    const { events } = translateGithubEvent(
      "issue_comment",
      {
        action: "created",
        issue: { number: 99, title: "Random discussion", labels: [] },
        comment: { body: "Cool thanks", created_at: "2026-05-21T08:00:00Z" },
        sender: { login: "alice", type: "User" },
      },
      ctx,
    );
    expect(events).toEqual([]);
  });

  it("bot comment on a NON-driver issue → still surfaced (in case Claude is invoked outside AgentWatch)", () => {
    const { events } = translateGithubEvent(
      "issue_comment",
      {
        action: "created",
        issue: { number: 99, title: "External", labels: [] },
        comment: { body: "Working on it.", created_at: "2026-05-21T08:00:00Z" },
        sender: { login: "claude[bot]", type: "Bot" },
      },
      ctx,
    );
    expect(events).toHaveLength(1);
  });

  it("empty comment body is dropped", () => {
    const { events } = translateGithubEvent(
      "issue_comment",
      {
        action: "created",
        issue: baseDriverIssue,
        comment: { body: "   ", created_at: "2026-05-21T08:00:00Z" },
        sender: { login: "claude[bot]", type: "Bot" },
      },
      ctx,
    );
    expect(events).toEqual([]);
  });

  it("non-created actions (edited, deleted) → no events", () => {
    const { events, recognized } = translateGithubEvent(
      "issue_comment",
      {
        action: "edited",
        issue: baseDriverIssue,
        comment: { body: "edited", created_at: "2026-05-21T08:00:00Z" },
        sender: { login: "alice", type: "User" },
      },
      ctx,
    );
    expect(recognized).toBe(true);
    expect(events).toEqual([]);
  });
});
