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

export function extensionFor(contentType: string): string | null {
  return TYPES[contentType.split(";")[0].trim().toLowerCase()] ?? null;
}

export function contentTypeFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return Object.entries(TYPES).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
}

/**
 * Writes an upload and returns the URL that serves it. The name is a hash of
 * the content, so uploading the same image twice does not produce two files —
 * and so the served bytes can be cached forever.
 */
export function saveMedia(bytes: Buffer, contentType: string): string {
  const ext = extensionFor(contentType);
  if (!ext) throw new Error(`Unsupported image type "${contentType}". Use JPEG, PNG, WebP or GIF.`);
  if (!bytes.byteLength) throw new Error("The file is empty");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error("The image is larger than 8 MB");

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
