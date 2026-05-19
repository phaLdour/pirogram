import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, name: true, role: true, status: true } },
      sprint: { select: { id: true, name: true, version: true, status: true } },
    },
  });
  if (!task) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const messages = await prisma.message.findMany({
    where: { taskId: id },
    orderBy: { createdAt: "asc" },
    include: { from: { select: { name: true } } },
    take: 200,
  });

  return NextResponse.json({
    task,
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      fromName: m.from.name,
      toAgentId: m.toAgentId,
    })),
  });
}
