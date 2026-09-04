/**
 * Open Graph reader. Pure by design: the caller fetches the HTML with the
 * project's own `fetchText` and passes it here, so the same parser serves the
 * ingest image pass and the link unfurl in the publication queue.
 */
export type OgTags = { image: string | null; title: string | null };

/** `<meta property="og:image" content="…">`, in either attribute order. */
function meta(html: string, attr: string, value: string): string | null {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${escaped}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${escaped}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** og:image is often a relative path; a preview and a webhook both need it absolute. */
function absolute(url: string, baseUrl: string): string | null {
  try {
    const resolved = new URL(url, baseUrl);
    return resolved.protocol === "http:" || resolved.protocol === "https:"
      ? resolved.toString()
      : null;
  } catch {
    return null;
  }
}

export function parseOg(html: string, baseUrl: string): OgTags {
  // Everything we want lives in <head>; reading further is wasted work on a
  // long article and risks matching a meta tag inside the body.
  const head = html.slice(0, 200_000);

  const rawImage =
    meta(head, "property", "og:image") ??
    meta(head, "name", "og:image") ??
    meta(head, "name", "twitter:image") ??
    meta(head, "property", "twitter:image");

  const rawTitle =
    meta(head, "property", "og:title") ??
    meta(head, "name", "twitter:title") ??
    head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
    null;

  const title = rawTitle ? decodeEntities(rawTitle).replace(/\s+/g, " ").trim().slice(0, 300) : "";

  return {
    image: rawImage ? absolute(decodeEntities(rawImage), baseUrl) : null,
    title: title || null,
  };
}
