import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { agentEventSchema } from "@/lib/webhook/schema";
import {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifySignature,
} from "@/lib/webhook/verify";
import { prisma } from "@/lib/db";
import { applyProjection } from "@/lib/projections";
import { publishLiveEvent } from "@/lib/realtime/publish";

export const runtime = "nodejs";

const UNIQUE_CONSTRAINT = "P2002";

export async function POST(req: Request) {
  const secret = process.env.WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "server-misconfigured" }, { status: 500 });
  }

  const raw = await req.text();

  const verified = verifySignature({
    body: raw,
    signatureHeader: req.headers.get(SIGNATURE_HEADER),
    timestampHeader: req.headers.get(TIMESTAMP_HEADER),
    secret,
  });
  if (!verified.ok) {
    return NextResponse.json({ error: "unauthorized", reason: verified.reason }, { status: 401 });
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

  await publishLiveEvent(event).catch((err) => {
    // Persistence already succeeded; a publish failure must not poison the ACK.
    console.error("live publish failed", err);
  });

  return NextResponse.json({ accepted: true, eventId: event.eventId }, { status: 202 });
}
