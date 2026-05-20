import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { applyProjection } from "@/lib/projections";
import { publishLiveEvent } from "@/lib/realtime/publish";
import { agentEventSchema, type AgentEvent } from "@/lib/webhook/schema";
import { verifyHmacOnly } from "@/lib/webhook/verify";
import { decryptRepoSecret, getActiveRepoByFullName, touchRepoLastEvent } from "@/lib/repos";
import { translateGithubEvent } from "@/lib/webhook/github-translator";
import { currentRequestId, generateRequestId, log, withRequestContext } from "@/lib/log";

export const runtime = "nodejs";

const UNIQUE_CONSTRAINT = "P2002";
const REQUEST_ID_HEADER = "x-request-id";
const SIG_HEADER = "x-hub-signature-256";
const EVENT_HEADER = "x-github-event";
const DELIVERY_HEADER = "x-github-delivery";

export async function POST(req: Request) {
  const requestId = req.headers.get(REQUEST_ID_HEADER) ?? generateRequestId();
  return withRequestContext(
    { requestId, route: "POST /api/webhook/github" },
    () => handle(req),
  );
}

async function handle(req: Request): Promise<Response> {
  const startedAt = performance.now();
  const raw = await req.text();
  const eventName = req.headers.get(EVENT_HEADER);
  const signature = req.headers.get(SIG_HEADER);
  const delivery = req.headers.get(DELIVERY_HEADER);

  if (!eventName || !signature || !delivery) {
    log.warn("github.missing-headers", {
      hasEvent: Boolean(eventName),
      hasSig: Boolean(signature),
      hasDelivery: Boolean(delivery),
    });
    return json({ error: "missing-github-headers" }, 400);
  }

  let payload: { repository?: { full_name?: string | null } } & Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    log.warn("github.invalid-json");
    return json({ error: "invalid-json" }, 400);
  }

  const fullName = payload.repository?.full_name;
  if (!fullName) {
    log.warn("github.missing-repo-full-name", { eventName });
    return json({ error: "missing-repository" }, 400);
  }

  const repo = await getActiveRepoByFullName(fullName);
  if (!repo) {
    log.warn("github.repo-not-found", { fullName, eventName });
    return json({ error: "repo-not-bound" }, 404);
  }

  let secret: string;
  try {
    secret = decryptRepoSecret(repo.encryptedSecret);
  } catch (err) {
    log.error("github.secret-decrypt-failed", err, { repoId: repo.id });
    return json({ error: "server-misconfigured" }, 500);
  }

  // GitHub's signature scheme is HMAC-SHA256 without a timestamp; replay
  // protection comes from the X-GitHub-Delivery UUID via EventLog idempotency.
  const verified = verifyHmacOnly({
    body: raw,
    signatureHeader: signature,
    secret,
  });
  if (!verified.ok) {
    log.warn("github.unauthorized", { repoId: repo.id, reason: verified.reason });
    return json({ error: "unauthorized" }, 401);
  }

  const { events, recognized } = translateGithubEvent(eventName, payload, {
    deliveryId: delivery,
    repoSlug: repo.fullName,
    now: new Date(),
  });

  if (!recognized) {
    log.info("github.unsupported-event", { eventName, repoId: repo.id });
    await touchRepoLastEvent(repo.id);
    return json({ accepted: true, recognized: false, eventName }, 202);
  }

  if (events.length === 0) {
    log.info("github.no-op", { eventName, repoId: repo.id });
    await touchRepoLastEvent(repo.id);
    return json({ accepted: true, persisted: 0 }, 202);
  }

  // Validate each translated event against the public AgentEvent schema so a
  // translator bug can't poison the projection pipeline.
  const validated: AgentEvent[] = [];
  for (const e of events) {
    const parsed = agentEventSchema.safeParse(e);
    if (!parsed.success) {
      log.error("github.translator-emitted-invalid", undefined, {
        eventName,
        issues: parsed.error.issues.length,
      });
      return json({ error: "translator-invalid" }, 500);
    }
    validated.push(parsed.data);
  }

  let persisted = 0;
  let duplicates = 0;
  for (const event of validated) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.eventLog.create({
          data: {
            eventId: event.eventId,
            type: event.type,
            payload: event as unknown as Prisma.InputJsonValue,
          },
        });
        await applyProjection(tx, event, { repoId: repo.id });
      });
      persisted += 1;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === UNIQUE_CONSTRAINT
      ) {
        duplicates += 1;
        continue;
      }
      log.error("github.persist-failed", err, { eventName, repoId: repo.id });
      return json({ error: "persist-failed" }, 500);
    }
    await publishLiveEvent(event).catch((err) => {
      log.error("github.publish-failed", err, { eventId: event.eventId });
    });
  }

  await touchRepoLastEvent(repo.id);

  const durationMs = Math.round(performance.now() - startedAt);
  log.info("github.accepted", {
    eventName,
    repoId: repo.id,
    fullName: repo.fullName,
    persisted,
    duplicates,
    durationMs,
  });
  return json({ accepted: true, persisted, duplicates }, 202);
}

function json(body: unknown, status: number): Response {
  const res = NextResponse.json(body, { status });
  const rid = currentRequestId();
  if (rid) res.headers.set(REQUEST_ID_HEADER, rid);
  return res;
}
