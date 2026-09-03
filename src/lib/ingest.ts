import { getDb, getSetting, parseJson, weekKey } from "./db";
import { getSourceKind, SEED_SOURCES } from "./sources";
import type { RawItem } from "./sources";
import type { Source } from "./types";

export function seedSources() {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO sources (name, url, kind, category, weight) VALUES (@name, @url, @kind, @category, @weight)
     ON CONFLICT(url) DO NOTHING`,
  );
  const tx = db.transaction(() => SEED_SOURCES.forEach((s) => insert.run(s)));
  tx();
}

export async function fetchSource(source: Source): Promise<RawItem[]> {
  const kind = getSourceKind(source.kind);
  if (!kind) throw new Error(`Unknown source kind "${source.kind}"`);
  return kind.fetch({
    id: source.id,
    name: source.name,
    url: source.url,
    kind: source.kind,
    config: parseJson<Record<string, unknown>>(source.config, {}),
  });
}

export async function ingestSource(source: Source): Promise<{ found: number; inserted: number }> {
  const raw = await fetchSource(source);
  const maxAgeDays = getSetting<number>("ingest_max_age_days", 14);

  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO items (source_id, external_id, title, url, author, summary, published_at, week_key, status)
     VALUES (@source_id, @external_id, @title, @url, @author, @summary, @published_at, @week_key, 'new')
     ON CONFLICT(external_id) DO NOTHING`,
  );

  let inserted = 0;
  const cutoff = Date.now() - maxAgeDays * 86400 * 1000;
  const tx = db.transaction((rows: RawItem[]) => {
    for (const r of rows) {
      if (!r.title || !r.url) continue;
      const pub = r.published_at ? new Date(r.published_at) : new Date();
      if (pub.getTime() < cutoff) continue;
      const res = insert.run({
        source_id: source.id,
        external_id: r.external_id,
        title: r.title.slice(0, 400),
        url: r.url,
        author: r.author ?? null,
        summary: r.summary ?? null,
        published_at: pub.toISOString(),
        week_key: weekKey(pub),
      });
      inserted += res.changes;
    }
  });
  tx(raw);
  return { found: raw.length, inserted };
}

export async function ingestAll(): Promise<{
  sources: number;
  found: number;
  inserted: number;
  errors: string[];
}> {
  const db = getDb();
  seedSources();
  const sources = db.prepare("SELECT * FROM sources WHERE enabled = 1").all() as Source[];
  const errors: string[] = [];
  let found = 0;
  let inserted = 0;

  const results = await Promise.allSettled(sources.map((s) => ingestSource(s)));
  results.forEach((r, i) => {
    const s = sources[i];
    if (r.status === "fulfilled") {
      found += r.value.found;
      inserted += r.value.inserted;
      db.prepare("UPDATE sources SET last_run_at = datetime('now'), last_error = NULL WHERE id = ?").run(s.id);
    } else {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      errors.push(`${s.name}: ${msg}`);
      db.prepare("UPDATE sources SET last_run_at = datetime('now'), last_error = ? WHERE id = ?").run(msg, s.id);
    }
  });

  return { sources: sources.length, found, inserted, errors };
}
