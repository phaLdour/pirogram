import { describe, expect, it } from "vitest";
import { nextStatus } from "@/lib/sprint-driver";

describe("nextStatus — sprint driver state machine", () => {
  it("REQUESTED + first claude comment → RUNNING", () => {
    expect(
      nextStatus("REQUESTED", {
        kind: "claude-comment-created",
        body: "On it. Exploring repo structure.",
        at: new Date(),
      }),
    ).toBe("RUNNING");
  });

  it("RUNNING + question comment → AWAITING_USER", () => {
    expect(
      nextStatus("RUNNING", {
        kind: "claude-comment-created",
        body: "Should I use Postgres or SQLite for the dev DB?",
        at: new Date(),
      }),
    ).toBe("AWAITING_USER");
  });

  it("AWAITING_USER + user-comment-created → RUNNING", () => {
    expect(nextStatus("AWAITING_USER", { kind: "user-comment-created" })).toBe("RUNNING");
  });

  it("RUNNING + non-question comment → RUNNING (claude still working)", () => {
    expect(
      nextStatus("RUNNING", {
        kind: "claude-comment-created",
        body: "Implemented the migration. Running tests now.",
        at: new Date(),
      }),
    ).toBe("RUNNING");
  });

  it("Any → COMPLETED on pr-merged-closes-issue", () => {
    expect(nextStatus("RUNNING", { kind: "pr-merged-closes-issue" })).toBe("COMPLETED");
    expect(nextStatus("AWAITING_USER", { kind: "pr-merged-closes-issue" })).toBe(
      "COMPLETED",
    );
  });

  it("Any non-terminal → FAILED on workflow-failed", () => {
    expect(nextStatus("REQUESTED", { kind: "workflow-failed" })).toBe("FAILED");
    expect(nextStatus("RUNNING", { kind: "workflow-failed" })).toBe("FAILED");
  });

  it("Terminal states are absorbing", () => {
    expect(nextStatus("COMPLETED", { kind: "workflow-failed" })).toBe("COMPLETED");
    expect(
      nextStatus("FAILED", {
        kind: "claude-comment-created",
        body: "Maybe try this?",
        at: new Date(),
      }),
    ).toBe("FAILED");
  });

  it("Empty / whitespace body is not treated as a question", () => {
    expect(
      nextStatus("RUNNING", {
        kind: "claude-comment-created",
        body: "   ",
        at: new Date(),
      }),
    ).toBe("RUNNING");
  });
});
