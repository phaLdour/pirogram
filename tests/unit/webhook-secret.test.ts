import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  generateSecret,
  secretHint,
} from "@/lib/webhook/secret";

const PRIOR_KEY = process.env.WEBHOOK_KEY_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.WEBHOOK_KEY_ENCRYPTION_KEY = "a".repeat(64);
});

afterEach(() => {
  if (PRIOR_KEY === undefined) delete process.env.WEBHOOK_KEY_ENCRYPTION_KEY;
  else process.env.WEBHOOK_KEY_ENCRYPTION_KEY = PRIOR_KEY;
});

describe("webhook/secret", () => {
  it("generateSecret returns 64-char hex (32 bytes)", () => {
    const s = generateSecret();
    expect(s).toMatch(/^[0-9a-f]{64}$/);
  });

  it("secretHint shows only the last 4 chars", () => {
    expect(secretHint("abcdef0123456789")).toBe("…6789");
  });

  it("encryptSecret roundtrips with decryptSecret", () => {
    const plain = generateSecret();
    const ct = encryptSecret(plain);
    expect(ct).not.toContain(plain);
    expect(decryptSecret(ct)).toBe(plain);
  });

  it("decryptSecret throws on tampered ciphertext", () => {
    const plain = generateSecret();
    const ct = encryptSecret(plain);
    const tampered = ct.slice(0, -2) + (ct.endsWith("aa") ? "bb" : "aa");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("decryptSecret throws when the master key differs", () => {
    const plain = generateSecret();
    const ct = encryptSecret(plain);
    process.env.WEBHOOK_KEY_ENCRYPTION_KEY = "b".repeat(64);
    expect(() => decryptSecret(ct)).toThrow();
  });
});
