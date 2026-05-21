import { describe, expect, it } from "vitest";
import { agentEventSchema } from "@/lib/webhook/schema";

const eventId = "00000000-0000-4000-8000-000000000000";
const at = "2026-05-21T12:00:00.000Z";

describe("agentEventSchema · ActivityStarted / ActivityEnded", () => {
  it("parses ActivityStarted for a generic tool", () => {
    const parsed = agentEventSchema.safeParse({
      type: "ActivityStarted",
      eventId,
      at,
      agent: "PM",
      toolUseId: "toolu_01ABC",
      toolName: "Bash",
    });
    expect(parsed.success).toBe(true);
  });

  it("parses ActivityStarted for a Task subagent with description", () => {
    const parsed = agentEventSchema.safeParse({
      type: "ActivityStarted",
      eventId,
      at,
      agent: "PM",
      toolUseId: "toolu_01DEF",
      toolName: "Task",
      subagentType: "Explore",
      description: "Survey hooks adapter",
      parentToolUseId: "toolu_01PARENT",
      sessionId: "sess-1",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects ActivityStarted without toolUseId", () => {
    const parsed = agentEventSchema.safeParse({
      type: "ActivityStarted",
      eventId,
      at,
      agent: "PM",
      toolName: "Bash",
    });
    expect(parsed.success).toBe(false);
  });

  it("caps description at 500 chars", () => {
    const parsed = agentEventSchema.safeParse({
      type: "ActivityStarted",
      eventId,
      at,
      agent: "PM",
      toolUseId: "t1",
      toolName: "Task",
      description: "x".repeat(501),
    });
    expect(parsed.success).toBe(false);
  });

  it("parses ActivityEnded with ok flag", () => {
    const parsed = agentEventSchema.safeParse({
      type: "ActivityEnded",
      eventId,
      at,
      toolUseId: "toolu_01ABC",
      ok: true,
    });
    expect(parsed.success).toBe(true);
  });

  it("parses ActivityEnded without an ok flag", () => {
    const parsed = agentEventSchema.safeParse({
      type: "ActivityEnded",
      eventId,
      at,
      toolUseId: "toolu_01ABC",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects ActivityEnded without toolUseId", () => {
    const parsed = agentEventSchema.safeParse({
      type: "ActivityEnded",
      eventId,
      at,
    });
    expect(parsed.success).toBe(false);
  });
});
