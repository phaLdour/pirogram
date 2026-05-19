import { auth } from "@/lib/auth";
import { isRedisConfigured, readSince } from "@/lib/realtime/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 500;
const HEARTBEAT_INTERVAL_MS = 15_000;
const ENCODER = new TextEncoder();

function sseChunk(opts: { id?: string; event?: string; data: string }): Uint8Array {
  const parts: string[] = [];
  if (opts.id) parts.push(`id: ${opts.id}`);
  if (opts.event) parts.push(`event: ${opts.event}`);
  parts.push(`data: ${opts.data}`);
  parts.push("", "");
  return ENCODER.encode(parts.join("\n"));
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("unauthorized", { status: 401 });
  }

  let lastId = req.headers.get("last-event-id") ?? "0";
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(sseChunk({ event: "ready", data: JSON.stringify({ ok: true }) }));

      if (!isRedisConfigured()) {
        controller.enqueue(
          sseChunk({
            event: "warning",
            data: JSON.stringify({ reason: "redis-not-configured" }),
          }),
        );
      }

      const heartbeat = setInterval(() => {
        if (cancelled) return;
        try {
          controller.enqueue(ENCODER.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          cancelled = true;
        }
      }, HEARTBEAT_INTERVAL_MS);

      req.signal.addEventListener("abort", () => {
        cancelled = true;
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });

      try {
        while (!cancelled) {
          const entries = await readSince(lastId, 50);
          for (const entry of entries) {
            controller.enqueue(
              sseChunk({ id: entry.id, event: "event", data: entry.payload }),
            );
            lastId = entry.id;
          }
          await sleep(POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (!cancelled) {
          controller.enqueue(
            sseChunk({
              event: "error",
              data: JSON.stringify({ message: err instanceof Error ? err.message : "stream-error" }),
            }),
          );
        }
      } finally {
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
