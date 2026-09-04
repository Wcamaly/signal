import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./db";

/** Next to signal.db, so backing up the data directory still backs up everything. */
export const MEDIA_DIR = path.join(DATA_DIR, "media");

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** What an upload is allowed to be. Anything else is refused before a byte is written. */
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * The format of an upload, read from its first bytes.
 *
 * A browser fills in a file's MIME type from its extension, so a text file
 * renamed to .png arrives claiming to be an image. Sniffing is what makes
 * "only these four formats" true rather than merely stated.
 */
export function sniffExtension(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString("latin1"))) return "gif";
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

export function contentTypeFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return Object.entries(TYPES).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
}

/**
 * Writes an upload and returns the URL that serves it. The name is a hash of
 * the content, so uploading the same image twice does not produce two files —
 * and so the served bytes can be cached forever.
 *
 * `declaredType` is only ever used to word the error: the extension comes from
 * the bytes themselves.
 */
export function saveMedia(bytes: Buffer, declaredType: string): string {
  if (!bytes.byteLength) throw new Error("The file is empty");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error("The image is larger than 8 MB");

  const ext = sniffExtension(bytes);
  if (!ext) {
    throw new Error(
      `That file is not a JPEG, PNG, WebP or GIF${declaredType ? ` (it says it is "${declaredType}")` : ""}.`,
    );
  }

  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const name = `${crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 32)}.${ext}`;
  const file = path.join(MEDIA_DIR, name);
  if (!fs.existsSync(file)) fs.writeFileSync(file, bytes);
  return `/media/${name}`;
}

/**
 * Resolves a requested name against the directory listing and refuses anything
 * that is not in it. Nothing from the request is ever joined into a path before
 * it has been proved to be a name the directory already contains.
 */
export function readMedia(name: string): { bytes: Buffer; contentType: string } | null {
  if (!fs.existsSync(MEDIA_DIR)) return null;
  if (!fs.readdirSync(MEDIA_DIR).includes(name)) return null;
  return {
    bytes: fs.readFileSync(path.join(MEDIA_DIR, name)),
    contentType: contentTypeFor(name),
  };
}
