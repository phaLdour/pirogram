import { describe, expect, it } from "vitest";
import { agentEventSchema } from "@/lib/webhook/schema";

const baseId = "00000000-0000-4000-8000-000000000000";
const at = "2026-05-19T12:00:00.000Z";

describe("agentEventSchema", () => {
  it("parses a TaskCreated event", () => {
    const parsed = agentEventSchema.safeParse({
      type: "TaskCreated",
      eventId: baseId,
      at,
      task: { id: "T-1", title: "Do thing" },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown type", () => {
    const parsed = agentEventSchema.safeParse({
      type: "Nope",
      eventId: baseId,
      at,
    });
    expect(parsed.success).toBe(false);
  });

  it("requires a uuid eventId", () => {
    const parsed = agentEventSchema.safeParse({
      type: "TeammateIdle",
      eventId: "not-a-uuid",
      at,
      agent: "PM",
    });
    expect(parsed.success).toBe(false);
  });
});
