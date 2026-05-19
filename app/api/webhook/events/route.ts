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

export const runtime = "nodejs";

const UNIQUE_CONSTRAINT = "P2002";

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
        console.error("failed to decrypt webhook key", k.id, err);
      }
    }
  }
  return out;
}

export async function POST(req: Request) {
  const raw = await req.text();
  const signatureHeader = req.headers.get(SIGNATURE_HEADER);
  const timestampHeader = req.headers.get(TIMESTAMP_HEADER);

  const candidates = await loadCandidateSecrets();
  if (candidates.length === 0) {
    return NextResponse.json({ error: "server-misconfigured" }, { status: 500 });
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
    return NextResponse.json({ error: "unauthorized", reason: lastReason }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const parsed = agentEventSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid-payload", issues: parsed.error.issues },
      { status: 422 },
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
      // Duplicate eventId — already processed. Idempotent ACK.
      return NextResponse.json({ accepted: true, eventId: event.eventId, duplicate: true }, { status: 202 });
    }
    console.error("webhook persist failed", err);
    return NextResponse.json({ error: "persist-failed" }, { status: 500 });
  }

  if (acceptedKeyId) {
    await prisma.webhookKey
      .update({ where: { id: acceptedKeyId }, data: { lastUsedAt: new Date() } })
      .catch(() => {
        /* best-effort; do not fail the ACK */
      });
  }

  await publishLiveEvent(event).catch((err) => {
    // Persistence already succeeded; a publish failure must not poison the ACK.
    console.error("live publish failed", err);
  });

  return NextResponse.json({ accepted: true, eventId: event.eventId }, { status: 202 });
}

type VerifyReason = "ok" | "missing-header" | "bad-timestamp" | "stale" | "bad-signature";
