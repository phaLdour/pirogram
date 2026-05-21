import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A tiny digest endpoint the client polls when SSE is unavailable. We don't
// stream full state — we just expose three monotonic cursors. If any of them
// moves, the client calls router.refresh() and re-fetches via the normal
// server snapshot. One DB round-trip per call, three trivial aggregates.
export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [latestMessage, latestActivity, openActivities] = await Promise.all([
    prisma.message.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.activity.findFirst({
      orderBy: { startedAt: "desc" },
      select: { startedAt: true, endedAt: true, id: true },
    }),
    prisma.activity.count({ where: { endedAt: null } }),
  ]);

  const cursor = [
    latestMessage?.createdAt.toISOString() ?? "0",
    latestActivity?.startedAt.toISOString() ?? "0",
    latestActivity?.endedAt?.toISOString() ?? "0",
    openActivities.toString(),
  ].join("|");

  return NextResponse.json({ cursor }, {
    headers: { "Cache-Control": "no-store" },
  });
}
