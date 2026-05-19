import { NextResponse } from "next/server";
import { agentEventSchema } from "@/lib/webhook/schema";
import {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifySignature,
} from "@/lib/webhook/verify";

export const runtime = "nodejs";

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

  // TODO(sprint-1): persist to Postgres + publish to Redis pub/sub.
  return NextResponse.json({ accepted: true, eventId: parsed.data.eventId }, { status: 202 });
}
