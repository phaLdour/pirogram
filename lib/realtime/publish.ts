import { getRedis, LIVE_EVENTS_STREAM } from "@/lib/redis";
import type { AgentEvent } from "@/lib/webhook/schema";

const STREAM_MAXLEN = 1000;

export async function publishLiveEvent(event: AgentEvent): Promise<string | null> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    // Redis is optional in local dev — surface a warning, do not fail the webhook.
    console.warn("UPSTASH_REDIS_REST_URL not set; skipping live publish.");
    return null;
  }
  const redis = getRedis();
  const id = await redis.xadd(
    LIVE_EVENTS_STREAM,
    "*",
    { payload: JSON.stringify(event) },
    { trim: { type: "MAXLEN", threshold: STREAM_MAXLEN, comparison: "~" } },
  );
  return typeof id === "string" ? id : null;
}
