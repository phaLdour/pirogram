import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

const SECRET_BYTES = 32;
const AES_KEY_LEN = 32;
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;
const ALGO = "aes-256-gcm" as const;

export function generateSecret(): string {
  return randomBytes(SECRET_BYTES).toString("hex");
}

export function secretHint(secret: string): string {
  return `…${secret.slice(-4)}`;
}

function masterKey(): Buffer {
  const env = process.env.WEBHOOK_KEY_ENCRYPTION_KEY;
  if (!env) {
    throw new Error(
      "WEBHOOK_KEY_ENCRYPTION_KEY is not set. Generate one with: openssl rand -hex 32.",
    );
  }
  // Accept either 64-char hex (32 bytes) or any string we stretch via scrypt.
  if (/^[0-9a-fA-F]{64}$/.test(env)) return Buffer.from(env, "hex");
  return scryptSync(env, "agentwatch-key-encryption-salt", AES_KEY_LEN);
}

/** Returns `<ivHex>:<tagHex>:<ciphertextHex>`. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, masterKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("hex")}`;
}

export function decryptSecret(stored: string): string {
  const [ivHex, tagHex, ctHex] = stored.split(":");
  if (!ivHex || !tagHex || !ctHex) throw new Error("Malformed encrypted secret.");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const ct = Buffer.from(ctHex, "hex");
  if (iv.length !== IV_LEN || tag.length !== AUTH_TAG_LEN) {
    throw new Error("Malformed encrypted secret.");
  }
  const decipher = createDecipheriv(ALGO, masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
