import { getDb } from "./db";
import { parseOg } from "./og";
import { fetchText } from "./sources/util";

/**
 * Fills in the image of the signals that survived curation by reading their
 * `og:image`. GitHub, arXiv and Hacker News carry no image in their payload,
 * so this is the only way those ever get one.
 *
 * Deliberately limited to the selected items — about ten pages a week instead
 * of every item ingested — and never fatal: an item with no image is normal.
 */
export async function fillSelectedImages(week: string, limit = 20): Promise<number> {
  const db = getDb();
  const items = db
    .prepare(
      `SELECT id, url FROM items
       WHERE week_key = ? AND status = 'selected' AND (image_url IS NULL OR image_url = '')
       LIMIT ?`,
    )
    .all(week, limit) as { id: number; url: string }[];
  if (!items.length) return 0;

  const results = await Promise.allSettled(
    items.map(async (item) => ({
      id: item.id,
      image: parseOg(await fetchText(item.url, 8000), item.url).image,
    })),
  );

  const update = db.prepare("UPDATE items SET image_url = ? WHERE id = ?");
  let filled = 0;
  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value.image) continue;
    update.run(r.value.image, r.value.id);
    filled += 1;
  }
  return filled;
}
