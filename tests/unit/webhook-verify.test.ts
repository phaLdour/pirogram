import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifySignature } from "@/lib/webhook/verify";

const SECRET = "test-secret";
const NOW_MS = 1_700_000_000_000;
const NOW_S = Math.floor(NOW_MS / 1000);

function sign(body: string) {
  return "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");
}

describe("verifySignature", () => {
  it("accepts a correctly signed, fresh payload", () => {
    const body = '{"hello":"world"}';
    const result = verifySignature({
      body,
      signatureHeader: sign(body),
      timestampHeader: String(NOW_S),
      secret: SECRET,
      now: NOW_MS,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects when headers are missing", () => {
    const result = verifySignature({
      body: "x",
      signatureHeader: null,
      timestampHeader: null,
      secret: SECRET,
      now: NOW_MS,
    });
    expect(result).toEqual({ ok: false, reason: "missing-header" });
  });

  it("rejects stale timestamps", () => {
    const body = '{"a":1}';
    const result = verifySignature({
      body,
      signatureHeader: sign(body),
      timestampHeader: String(NOW_S - 10 * 60),
      secret: SECRET,
      now: NOW_MS,
    });
    expect(result).toEqual({ ok: false, reason: "stale" });
  });

  it("rejects bad signatures in constant time", () => {
    const body = '{"a":1}';
    const result = verifySignature({
      body,
      signatureHeader: "sha256=" + "0".repeat(64),
      timestampHeader: String(NOW_S),
      secret: SECRET,
      now: NOW_MS,
    });
    expect(result).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects body tampering", () => {
    const body = '{"a":1}';
    const sig = sign(body);
    const result = verifySignature({
      body: '{"a":2}',
      signatureHeader: sig,
      timestampHeader: String(NOW_S),
      secret: SECRET,
      now: NOW_MS,
    });
    expect(result).toEqual({ ok: false, reason: "bad-signature" });
  });
});
