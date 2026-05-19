import { getRedis, LIVE_EVENTS_STREAM } from "@/lib/redis";

export type StreamEntry = { id: string; payload: string };

export function isRedisConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

/**
 * Read at most `count` entries from `events:live` strictly after `lastId`.
 * Returns an empty array if nothing new is available; the SSE handler is
 * responsible for the polling cadence.
 */
export async function readSince(lastId: string, count = 50): Promise<StreamEntry[]> {
  if (!isRedisConfigured()) return [];
  const redis = getRedis();
  // Upstash returns: Record<id, Record<field, value>>
  const raw = (await redis.xrange(LIVE_EVENTS_STREAM, exclusive(lastId), "+", count)) as
    | Record<string, Record<string, string>>
    | null;
  if (!raw) return [];
  return Object.entries(raw).map(([id, fields]) => ({
    id,
    payload: fields["payload"] ?? "",
  }));
}

function exclusive(id: string): string {
  if (id === "0" || id === "0-0" || id === "") return "-";
  return `(${id}`;
}
