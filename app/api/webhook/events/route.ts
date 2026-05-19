import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { agentEventSchema } from "@/lib/webhook/schema";
import {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifySignature,
} from "@/lib/webhook/verify";
import { decryptSecret } from "@/lib/webhook/secret";
import { prisma } from "@/lib/db";
import { applyProjection } from "@/lib/projections";
import { publishLiveEvent } from "@/lib/realtime/publish";
import { currentRequestId, generateRequestId, log, withRequestContext } from "@/lib/log";

export const runtime = "nodejs";

const UNIQUE_CONSTRAINT = "P2002";
const REQUEST_ID_HEADER = "x-request-id";

async function loadCandidateSecrets(): Promise<Array<{ id: string | null; secret: string }>> {
  const out: Array<{ id: string | null; secret: string }> = [];
  if (process.env.WEBHOOK_SIGNING_SECRET) {
    out.push({ id: null, secret: process.env.WEBHOOK_SIGNING_SECRET });
  }
  if (process.env.WEBHOOK_KEY_ENCRYPTION_KEY) {
    const keys = await prisma.webhookKey.findMany({ where: { revokedAt: null } });
    for (const k of keys) {
      try {
        out.push({ id: k.id, secret: decryptSecret(k.encryptedSecret) });
      } catch (err) {
        log.error("webhook.key-decrypt-failed", err, { keyId: k.id });
      }
    }
  }
  return out;
}

export async function POST(req: Request) {
  const requestId = req.headers.get(REQUEST_ID_HEADER) ?? generateRequestId();
  return withRequestContext({ requestId, route: "POST /api/webhook/events" }, () => handle(req));
}

type VerifyReason = "ok" | "missing-header" | "bad-timestamp" | "stale" | "bad-signature";

async function handle(req: Request): Promise<Response> {
  const startedAt = performance.now();
  const raw = await req.text();
  const signatureHeader = req.headers.get(SIGNATURE_HEADER);
  const timestampHeader = req.headers.get(TIMESTAMP_HEADER);

  const candidates = await loadCandidateSecrets();
  if (candidates.length === 0) {
    log.error("webhook.no-secrets-configured");
    return jsonWithRequestId({ error: "server-misconfigured" }, 500);
  }

  let acceptedKeyId: string | null = null;
  let lastReason: VerifyReason = "missing-header";
  for (const cand of candidates) {
    const result = verifySignature({
      body: raw,
      signatureHeader,
      timestampHeader,
      secret: cand.secret,
    });
    if (result.ok) {
      acceptedKeyId = cand.id;
      lastReason = "ok";
      break;
    }
    lastReason = result.reason;
  }
  if (lastReason !== "ok") {
    log.warn("webhook.unauthorized", { reason: lastReason, bodyBytes: raw.length });
    return jsonWithRequestId({ error: "unauthorized", reason: lastReason }, 401);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    log.warn("webhook.invalid-json", { bodyBytes: raw.length });
    return jsonWithRequestId({ error: "invalid-json" }, 400);
  }

  const parsed = agentEventSchema.safeParse(json);
  if (!parsed.success) {
    log.warn("webhook.invalid-payload", { issues: parsed.error.issues.length });
    return jsonWithRequestId(
      { error: "invalid-payload", issues: parsed.error.issues },
      422,
    );
  }
  const event = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.eventLog.create({
        data: {
          eventId: event.eventId,
          type: event.type,
          payload: event as unknown as Prisma.InputJsonValue,
        },
      });
      await applyProjection(tx, event);
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_CONSTRAINT) {
      log.info("webhook.duplicate", { eventId: event.eventId, type: event.type });
      return jsonWithRequestId(
        { accepted: true, eventId: event.eventId, duplicate: true },
        202,
      );
    }
    log.error("webhook.persist-failed", err, { eventId: event.eventId, type: event.type });
    return jsonWithRequestId({ error: "persist-failed" }, 500);
  }

  if (acceptedKeyId) {
    await prisma.webhookKey
      .update({ where: { id: acceptedKeyId }, data: { lastUsedAt: new Date() } })
      .catch((err) => {
        log.warn("webhook.key-touch-failed", { keyId: acceptedKeyId, err: String(err) });
      });
  }

  await publishLiveEvent(event).catch((err) => {
    log.error("webhook.publish-failed", err, { eventId: event.eventId });
  });

  const durationMs = Math.round(performance.now() - startedAt);
  log.info("webhook.accepted", {
    eventId: event.eventId,
    type: event.type,
    keyId: acceptedKeyId,
    durationMs,
  });
  return jsonWithRequestId({ accepted: true, eventId: event.eventId }, 202);
}

function jsonWithRequestId(body: unknown, status: number): Response {
  const res = NextResponse.json(body, { status });
  const requestId = currentRequestId();
  if (requestId) res.headers.set(REQUEST_ID_HEADER, requestId);
  return res;
}
