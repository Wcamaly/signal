import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./db";

/**
 * Symmetric encryption for the credentials the user types into the UI.
 *
 * The key comes from SIGNAL_SECRET_KEY. If that variable is not set, a random
 * key is generated once and stored next to the database with 0600 permissions,
 * so a fresh clone works without configuration. Set SIGNAL_SECRET_KEY in any
 * deployment where the data directory is not private, or where you want the
 * database to be restorable on another machine.
 */

const KEY_FILE = path.join(DATA_DIR, ".signal-key");
let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;

  const fromEnv = process.env.SIGNAL_SECRET_KEY;
  if (fromEnv) {
    cachedKey = crypto.createHash("sha256").update(fromEnv).digest();
    return cachedKey;
  }

  try {
    cachedKey = Buffer.from(fs.readFileSync(KEY_FILE, "utf8").trim(), "hex");
    if (cachedKey.length === 32) return cachedKey;
  } catch {
    // no key file yet
  }

  const generated = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, generated.toString("hex"), { mode: 0o600 });
  cachedKey = generated;
  return cachedKey;
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", loadKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, tagB64, ctB64] = payload.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !ctB64) {
    throw new Error("Stored secret has an unknown format");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    loadKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Last characters of a secret, for display in the UI. Never the whole value. */
export function secretHint(plain: string): string {
  const tail = plain.trim().slice(-4);
  return tail ? `••••${tail}` : "••••";
}

/** True when the encryption key is pinned by configuration instead of generated. */
export function secretKeyIsManaged(): boolean {
  return Boolean(process.env.SIGNAL_SECRET_KEY);
}
