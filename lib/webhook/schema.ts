import { z } from "zod";

const iso = z.string().datetime({ offset: true });

const taskShape = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  assignee: z.string().optional(),
});

export const agentEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("TaskCreated"),
    eventId: z.string().uuid(),
    at: iso,
    task: taskShape,
  }),
  z.object({
    type: z.literal("TaskCompleted"),
    eventId: z.string().uuid(),
    at: iso,
    taskId: z.string().min(1),
  }),
  z.object({
    type: z.literal("TeammateIdle"),
    eventId: z.string().uuid(),
    at: iso,
    agent: z.string().min(1),
  }),
  z.object({
    type: z.literal("Message"),
    eventId: z.string().uuid(),
    at: iso,
    from: z.string().min(1),
    to: z.string().min(1).optional(),
    taskId: z.string().min(1).optional(),
    body: z.string().min(1),
  }),
  z.object({
    type: z.literal("SprintStarted"),
    eventId: z.string().uuid(),
    at: iso,
    sprint: z.object({ name: z.string().min(1), goal: z.string().optional() }),
  }),
  z.object({
    type: z.literal("SprintEnded"),
    eventId: z.string().uuid(),
    at: iso,
    sprintId: z.string().min(1),
  }),
  z.object({
    type: z.literal("ActivityStarted"),
    eventId: z.string().uuid(),
    at: iso,
    agent: z.string().min(1),
    toolUseId: z.string().min(1),
    toolName: z.string().min(1),
    parentToolUseId: z.string().min(1).optional(),
    subagentType: z.string().min(1).optional(),
    description: z.string().max(500).optional(),
    sessionId: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal("ActivityEnded"),
    eventId: z.string().uuid(),
    at: iso,
    toolUseId: z.string().min(1),
    ok: z.boolean().optional(),
  }),
]);

export type AgentEvent = z.infer<typeof agentEventSchema>;
