import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { isRedisConfigured } from "@/lib/realtime/stream";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Check = { ok: boolean; latencyMs: number; error?: string };

async function checkDb(): Promise<Check> {
  const start = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

async function checkRedis(): Promise<Check | null> {
  if (!isRedisConfigured()) return null;
  const start = performance.now();
  try {
    const pong = await getRedis().ping();
    return {
      ok: pong === "PONG",
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

export async function GET() {
  const [db, redis] = await Promise.all([checkDb(), checkRedis()]);
  const allOk = db.ok && (redis === null || redis.ok);
  const status = allOk ? 200 : 503;
  if (!allOk) log.warn("health.degraded", { db, redis });
  return NextResponse.json(
    {
      status: allOk ? "ok" : "degraded",
      at: new Date().toISOString(),
      checks: {
        db,
        redis: redis ?? { skipped: true },
      },
    },
    { status },
  );
}
