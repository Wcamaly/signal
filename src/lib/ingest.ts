import { XMLParser } from "fast-xml-parser";
import { getDb, weekKey } from "./db";
import { SEED_SOURCES } from "./sources";
import type { Source } from "./types";

const UA = "SignalBot/0.1 (+trend radar; contact: local)";

export function seedSources() {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO sources (name, url, kind, category, weight) VALUES (@name, @url, @kind, @category, @weight)
     ON CONFLICT(url) DO NOTHING`,
  );
  const tx = db.transaction(() => SEED_SOURCES.forEach((s) => insert.run(s)));
  tx();
}

function stripHtml(s: string | undefined | null): string {
  if (!s) return "";
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export type RawItem = {
  external_id: string;
  title: string;
  url: string;
  author?: string | null;
  summary?: string | null;
  published_at?: string | null;
};

async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, text/xml, */*" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/* ---------------- RSS / Atom ---------------- */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function textOf(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>))
    return String((v as Record<string, unknown>)["#text"] ?? "");
  return String(v);
}

export async function fetchRss(url: string): Promise<RawItem[]> {
  const xml = await fetchText(url);
  const doc = parser.parse(xml);

  // RSS 2.0
  const rssItems = asArray(doc?.rss?.channel?.item);
  if (rssItems.length) {
    return rssItems.slice(0, 40).map((it: Record<string, unknown>) => {
      const link = textOf(it.link) || textOf((it.guid as Record<string, unknown>) ?? "");
      return {
        external_id: textOf(it.guid) || link || textOf(it.title),
        title: stripHtml(textOf(it.title)),
        url: link,
        author: stripHtml(textOf(it["dc:creator"] ?? it.author)) || null,
        summary: stripHtml(textOf(it.description ?? it["content:encoded"])).slice(0, 1200) || null,
        published_at: normalizeDate(textOf(it.pubDate ?? it["dc:date"])),
      };
    });
  }

  // Atom
  const atomEntries = asArray(doc?.feed?.entry);
  if (atomEntries.length) {
    return atomEntries.slice(0, 40).map((e: Record<string, unknown>) => {
      const links = asArray(e.link as Record<string, unknown>[]);
      const alt =
        links.find((l) => l?.["@_rel"] === "alternate" || !l?.["@_rel"])?.["@_href"] ??
        links[0]?.["@_href"];
      const author = e.author as Record<string, unknown> | undefined;
      return {
        external_id: textOf(e.id) || String(alt ?? "") || textOf(e.title),
        title: stripHtml(textOf(e.title)),
        url: String(alt ?? ""),
        author: author ? stripHtml(textOf(author.name)) : null,
        summary: stripHtml(textOf(e.summary ?? e.content)).slice(0, 1200) || null,
        published_at: normalizeDate(textOf(e.published ?? e.updated)),
      };
    });
  }

  return [];
}

function normalizeDate(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/* ---------------- Hacker News (Algolia) ---------------- */

const HN_QUERIES: Record<string, string> = {
  ai: "AI OR LLM OR \"language model\"",
  agents: "AI agents OR agentic OR RAG OR fine-tuning",
};

export async function fetchHn(key: string, days = 8): Promise<RawItem[]> {
  const q = HN_QUERIES[key] ?? key;
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const url =
    `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}` +
    `&tags=story&numericFilters=created_at_i>${since},points>80&hitsPerPage=30`;
  const json = JSON.parse(await fetchText(url)) as {
    hits: Array<{
      objectID: string;
      title: string;
      url: string | null;
      author: string;
      points: number;
      num_comments: number;
      created_at: string;
      story_text?: string;
    }>;
  };
  return json.hits.map((h) => ({
    external_id: `hn:${h.objectID}`,
    title: h.title,
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    author: h.author,
    summary: `${h.points} puntos · ${h.num_comments} comentarios en Hacker News. ${stripHtml(h.story_text ?? "")}`.slice(0, 800),
    published_at: h.created_at,
  }));
}

/* ---------------- arXiv ---------------- */

export async function fetchArxiv(category: string): Promise<RawItem[]> {
  const url =
    `http://export.arxiv.org/api/query?search_query=cat:${encodeURIComponent(category)}` +
    `&sortBy=submittedDate&sortOrder=descending&max_results=25`;
  const xml = await fetchText(url);
  const doc = parser.parse(xml);
  return asArray(doc?.feed?.entry).map((e: Record<string, unknown>) => ({
    external_id: textOf(e.id),
    title: stripHtml(textOf(e.title)),
    url: textOf(e.id),
    author: asArray(e.author as Record<string, unknown>[])
      .slice(0, 3)
      .map((a) => textOf(a.name))
      .join(", "),
    summary: stripHtml(textOf(e.summary)).slice(0, 1000),
    published_at: normalizeDate(textOf(e.published)),
  }));
}

/* ---------------- Orquestación ---------------- */

export async function ingestSource(source: Source): Promise<{ found: number; inserted: number }> {
  let raw: RawItem[] = [];
  if (source.kind === "rss") raw = await fetchRss(source.url);
  else if (source.kind === "hn") raw = await fetchHn(source.url.replace("hn:", ""));
  else if (source.kind === "arxiv") raw = await fetchArxiv(source.url.replace("arxiv:", ""));

  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO items (source_id, external_id, title, url, author, summary, published_at, week_key, status)
     VALUES (@source_id, @external_id, @title, @url, @author, @summary, @published_at, @week_key, 'new')
     ON CONFLICT(external_id) DO NOTHING`,
  );

  let inserted = 0;
  const cutoff = Date.now() - 14 * 86400 * 1000;
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
      const msg = String(r.reason?.message ?? r.reason);
      errors.push(`${s.name}: ${msg}`);
      db.prepare("UPDATE sources SET last_run_at = datetime('now'), last_error = ? WHERE id = ?").run(msg, s.id);
    }
  });

  return { sources: sources.length, found, inserted, errors };
}
