import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

export const DATA_DIR = process.env.SIGNAL_DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const globalForDb = globalThis as unknown as { __signalDb?: Database.Database };

function init(db: Database.Database) {
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,              -- id of a registered source kind (see lib/sources)
      category TEXT DEFAULT 'general', -- labs | research | product | community | business | ...
      weight REAL DEFAULT 1.0,
      config TEXT DEFAULT '{}',        -- JSON, kind-specific options
      enabled INTEGER DEFAULT 1,
      last_run_at TEXT,
      last_error TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
      external_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      author TEXT,
      summary TEXT,
      published_at TEXT,
      week_key TEXT,
      score REAL,                      -- 0..100, assigned by the curator
      why TEXT,                        -- why it matters (curator)
      angle TEXT,                      -- suggested editorial angle
      topics TEXT,                     -- JSON array
      cluster TEXT,                    -- name of the grouped story
      status TEXT DEFAULT 'new',       -- new | scored | selected | rejected | used
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_items_week ON items(week_key);
    CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);

    CREATE TABLE IF NOT EXISTS digests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_key TEXT NOT NULL UNIQUE,
      title TEXT,
      subtitle TEXT,
      markdown TEXT,
      item_ids TEXT,                   -- JSON array
      status TEXT DEFAULT 'draft',     -- draft | approved
      model TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      digest_id INTEGER REFERENCES digests(id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
      platform TEXT NOT NULL,          -- key of a row in channels
      angle TEXT,
      hook TEXT,
      body TEXT NOT NULL,
      hashtags TEXT,
      visual_brief TEXT,               -- image / carousel brief
      char_count INTEGER,
      status TEXT DEFAULT 'draft',     -- draft | approved | scheduled | published | discarded
      scheduled_at TEXT,
      published_at TEXT,
      published_url TEXT,
      notes TEXT,
      model TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);

    -- Publishing targets. A channel is any place a draft can end up:
    -- a social network, a newsletter, a blog. Fully editable from the UI.
    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,        -- stable slug, stored in posts.platform
      label TEXT NOT NULL,
      char_limit INTEGER DEFAULT 3000,
      color TEXT DEFAULT '#8b93a1',
      hint TEXT,                       -- format guidance injected into the writer prompt
      template TEXT,                   -- publication template ({{body}}, {{hashtags}}, ...)
      publisher TEXT DEFAULT 'manual', -- id of a registered publisher (see lib/publishers)
      config TEXT DEFAULT '{}',        -- JSON, publisher-specific non-secret options
      credential_id INTEGER REFERENCES credentials(id) ON DELETE SET NULL,
      posts_per_run INTEGER DEFAULT 2,
      enabled INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 100,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- API keys and tokens entered from the UI. Secrets are encrypted at rest
    -- (see lib/secrets.ts) and never sent back to the browser.
    CREATE TABLE IF NOT EXISTS credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL,             -- llm | channel
      provider TEXT NOT NULL,          -- anthropic | openai | mastodon | webhook | ...
      label TEXT NOT NULL,
      secret TEXT NOT NULL,            -- encrypted payload
      hint TEXT,                        -- last characters, for display only
      extra TEXT DEFAULT '{}',         -- JSON, non-secret metadata (base url, account, ...)
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      last_used_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_credentials_slot ON credentials(scope, provider, label);

    -- Prompt overrides written from the UI. Missing row = shipped default.
    CREATE TABLE IF NOT EXISTS prompts (
      key TEXT PRIMARY KEY,            -- curator | digest | writer | refine
      system TEXT,
      template TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,              -- ingest | curate | digest | posts | full
      status TEXT NOT NULL,            -- running | ok | error
      stats TEXT,
      log TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      finished_at TEXT
    );
  `);

  // Migrations for databases created by earlier versions.
  ensureColumn(db, "sources", "config", "TEXT DEFAULT '{}'");
  ensureColumn(db, "posts", "published_url", "TEXT");
  // Post language, images and links.
  ensureColumn(db, "items", "image_url", "TEXT");
  ensureColumn(db, "channels", "language", "TEXT"); // NULL = inherit the voice profile
  ensureColumn(db, "digests", "language", "TEXT");
  ensureColumn(db, "posts", "language", "TEXT");
  ensureColumn(db, "posts", "link", "TEXT");
  ensureColumn(db, "posts", "link_title", "TEXT");
  ensureColumn(db, "posts", "link_image", "TEXT");
  ensureColumn(db, "posts", "image_url", "TEXT");
  ensureColumn(db, "posts", "image_alt", "TEXT");
}

function ensureColumn(db: Database.Database, table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

export function getDb(): Database.Database {
  if (!globalForDb.__signalDb) {
    const db = new Database(path.join(DATA_DIR, "signal.db"));
    init(db);
    globalForDb.__signalDb = db;
  }
  return globalForDb.__signalDb;
}

/* ---------- settings helpers ---------- */

export function getSetting<T = string>(key: string, fallback: T): T {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return row.value as unknown as T;
  }
}

export function setSetting(key: string, value: unknown) {
  getDb()
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, JSON.stringify(value));
}

export function deleteSetting(key: string) {
  getDb().prepare("DELETE FROM settings WHERE key = ?").run(key);
}

/* ---------- misc ---------- */

export function weekKey(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
