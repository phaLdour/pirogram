import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_HEADER = "x-agentwatch-signature";
export const TIMESTAMP_HEADER = "x-agentwatch-timestamp";
export const MAX_SKEW_SECONDS = 5 * 60;

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing-header" | "bad-timestamp" | "stale" | "bad-signature" };

export function verifySignature(params: {
  body: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
  secret: string;
  now?: number;
}): VerifyResult {
  const { body, signatureHeader, timestampHeader, secret } = params;
  if (!signatureHeader || !timestampHeader) return { ok: false, reason: "missing-header" };

  const ts = Number.parseInt(timestampHeader, 10);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad-timestamp" };

  const now = Math.floor((params.now ?? Date.now()) / 1000);
  if (Math.abs(now - ts) > MAX_SKEW_SECONDS) return { ok: false, reason: "stale" };

  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const provided = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;

  if (expected.length !== provided.length) return { ok: false, reason: "bad-signature" };

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(provided, "hex");
  if (a.length !== b.length) return { ok: false, reason: "bad-signature" };

  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "bad-signature" };
}
