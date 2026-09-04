import { readMedia } from "@/lib/media";

export const dynamic = "force-dynamic";

/**
 * Serves an uploaded image. The name is resolved against the directory listing
 * in lib/media.ts, never concatenated into a path, so `..` and absolute paths
 * simply do not match anything.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const file = readMedia(name);
  if (!file) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "content-type": file.contentType,
      // The name is a hash of the bytes, so they can never change under it.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
