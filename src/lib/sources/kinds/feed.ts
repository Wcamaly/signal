import type { RawItem, SourceKind, SourceRef } from "../types";
import { asArray, fetchText, normalizeDate, num, parser, stripHtml, textOf } from "../util";

/**
 * Picks an image out of whatever the feed offers. RSS puts it in `enclosure`,
 * `media:thumbnail` or `media:content`; Atom feeds that carry video — YouTube
 * above all — nest the same tags inside a `media:group`.
 */
function feedImage(node: Record<string, unknown>): string | null {
  const scopes = [node, node["media:group"] as Record<string, unknown> | undefined];
  for (const scope of scopes) {
    if (!scope) continue;
    for (const key of ["media:thumbnail", "media:content", "enclosure"]) {
      for (const entry of asArray(scope[key] as Record<string, unknown>[])) {
        const url = String(entry?.["@_url"] ?? "").trim();
        if (!/^https?:\/\//i.test(url)) continue;
        // An enclosure is also how a podcast ships its audio file.
        const type = String(entry?.["@_type"] ?? entry?.["@_medium"] ?? "");
        if (
          key === "enclosure" &&
          !type.startsWith("image") &&
          !/\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)
        ) {
          continue;
        }
        return url;
      }
    }
  }
  return null;
}

/** Parses both RSS 2.0 and Atom. Reused by every kind that is a feed underneath. */
export async function parseFeed(url: string, maxItems = 40): Promise<RawItem[]> {
  const doc = parser.parse(await fetchText(url));

  const rssItems = asArray(doc?.rss?.channel?.item);
  if (rssItems.length) {
    return rssItems.slice(0, maxItems).map((it: Record<string, unknown>) => {
      const link = textOf(it.link) || textOf((it.guid as Record<string, unknown>) ?? "");
      return {
        external_id: textOf(it.guid) || link || textOf(it.title),
        title: stripHtml(textOf(it.title)),
        url: link,
        author: stripHtml(textOf(it["dc:creator"] ?? it.author)) || null,
        summary: stripHtml(textOf(it.description ?? it["content:encoded"])).slice(0, 1200) || null,
        published_at: normalizeDate(textOf(it.pubDate ?? it["dc:date"])),
        image_url: feedImage(it),
      };
    });
  }

  const atomEntries = asArray(doc?.feed?.entry);
  if (atomEntries.length) {
    return atomEntries.slice(0, maxItems).map((e: Record<string, unknown>) => {
      const links = asArray(e.link as Record<string, unknown>[]);
      const alt =
        links.find((l) => l?.["@_rel"] === "alternate" || !l?.["@_rel"])?.["@_href"] ??
        links[0]?.["@_href"];
      const author = e.author as Record<string, unknown> | undefined;
      const media = e["media:group"] as Record<string, unknown> | undefined;
      return {
        external_id: textOf(e.id) || String(alt ?? "") || textOf(e.title),
        title: stripHtml(textOf(e.title)),
        url: String(alt ?? ""),
        author: author ? stripHtml(textOf(author.name)) : null,
        summary:
          stripHtml(textOf(e.summary ?? e.content ?? media?.["media:description"])).slice(0, 1200) ||
          null,
        published_at: normalizeDate(textOf(e.published ?? e.updated)),
        image_url: feedImage(e),
      };
    });
  }

  return [];
}

export const rssKind: SourceKind = {
  id: "rss",
  label: "RSS / Atom",
  urlLabel: "Feed URL",
  placeholder: "https://example.com/feed.xml",
  help: "Any RSS 2.0 or Atom feed. The most common way to add a blog, a lab or a newsroom.",
  configFields: [
    { key: "maxItems", label: "Max items per run", type: "number", placeholder: "40" },
  ],
  fetch: (s: SourceRef) => parseFeed(s.url, num(s.config, "maxItems", 40)),
};
