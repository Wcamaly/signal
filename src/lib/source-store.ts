import { getCategory } from "./categories";
import { getDb } from "./db";
import type { Source } from "./types";

/** What the source form sends. `kind` is fixed once the source exists. */
export type SourceInput = {
  name: string;
  url: string;
  kind: string;
  category: string;
  config: Record<string, string>;
};

/** A source with how many items it has contributed, for the list. */
export type SourceRow = Source & { item_count: number };

/** Every source, or only those of one category, grouped by category then name. */
export function listSources(category: string | null = null): SourceRow[] {
  return getDb()
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM items i WHERE i.source_id = s.id) AS item_count
       FROM sources s WHERE (? IS NULL OR s.category = ?) ORDER BY s.category, s.name`,
    )
    .all(category, category) as SourceRow[];
}

export function getSource(id: number): Source | undefined {
  return getDb().prepare("SELECT * FROM sources WHERE id = ?").get(id) as Source | undefined;
}

/**
 * The checks an add and an edit share: a name and a URL, a category that
 * exists, a URL no other source uses. Empty options are dropped, so a cleared
 * field falls back to the kind's default.
 */
function clean(input: Omit<SourceInput, "kind">, id: number | null) {
  const name = input.name.trim();
  const url = input.url.trim();
  if (!name || !url) throw new Error("Name and URL are required");
  if (!getCategory(input.category)) throw new Error(`Unknown category "${input.category}"`);
  const taken = getDb().prepare("SELECT id, name FROM sources WHERE url = ?").get(url) as
    | { id: number; name: string }
    | undefined;
  if (taken && taken.id !== id) throw new Error(`"${taken.name}" already reads ${url}`);
  const config = Object.fromEntries(
    Object.entries(input.config ?? {}).filter(([, v]) => String(v).trim() !== ""),
  );
  return { name, url, category: input.category, config: JSON.stringify(config) };
}

/** Creates a source. Returns its id. */
export function addSource(input: SourceInput): number {
  const row = clean(input, null);
  const res = getDb()
    .prepare(
      "INSERT INTO sources (name, url, kind, category, weight, config) VALUES (@name, @url, @kind, @category, 1.0, @config)",
    )
    .run({ ...row, kind: input.kind });
  return Number(res.lastInsertRowid);
}

/**
 * Edits a source: name, URL, category and the options of its kind. The kind
 * itself never changes — a feed and a subreddit are different sources. The
 * last error belonged to the old settings, so it goes.
 */
export function updateSource(id: number, input: Omit<SourceInput, "kind">) {
  if (!getSource(id)) throw new Error("Source not found");
  const row = clean(input, id);
  getDb()
    .prepare(
      `UPDATE sources SET name = @name, url = @url, category = @category, config = @config,
       last_error = NULL WHERE id = @id`,
    )
    .run({ ...row, id });
}

/** A stored config as the form's strings. */
export function sourceConfig(source: Source): Record<string, string> {
  try {
    const parsed = JSON.parse(source.config ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
  } catch {
    return {};
  }
}
