import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

// Default mock: authenticated. Individual tests override per-call.
const authMock = vi.fn().mockResolvedValue({ user: { id: "u-test", role: "ADMIN" } });
vi.mock("@/lib/auth", () => ({ auth: authMock }));

const prisma = new PrismaClient();

beforeEach(async () => {
  authMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "u-test", role: "ADMIN" } });
  await prisma.$transaction([
    prisma.message.deleteMany(),
    prisma.task.deleteMany(),
    prisma.agent.deleteMany(),
    prisma.sprint.deleteMany(),
    prisma.eventLog.deleteMany(),
  ]);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function callGet(id: string) {
  const mod = await import("@/app/api/tasks/[id]/route");
  return mod.GET(new Request(`http://localhost/api/tasks/${id}`), {
    params: Promise.resolve({ id }),
  });
}

describe("GET /api/tasks/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await callGet("anything");
    expect(res.status).toBe(401);
  });

  it("returns 404 when the task does not exist", async () => {
    const res = await callGet("missing");
    expect(res.status).toBe(404);
  });

  it("returns task + messages when authenticated and the task exists", async () => {
    const agent = await prisma.agent.create({
      data: { name: "PM", role: "product" },
    });
    await prisma.task.create({
      data: { id: "T-OK", title: "feat: visible", assigneeId: agent.id },
    });
    await prisma.message.create({
      data: { fromAgentId: agent.id, taskId: "T-OK", body: "first" },
    });
    await prisma.message.create({
      data: { fromAgentId: agent.id, taskId: "T-OK", body: "second" },
    });

    const res = await callGet("T-OK");
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      task: { id: string; title: string; assignee: { name: string } | null };
      messages: Array<{ body: string; fromName: string }>;
    };
    expect(json.task.id).toBe("T-OK");
    expect(json.task.assignee?.name).toBe("PM");
    expect(json.messages).toHaveLength(2);
    expect(json.messages.map((m) => m.body)).toEqual(["first", "second"]);
  });
});
