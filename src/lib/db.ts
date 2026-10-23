import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

export const DATA_DIR = process.env.SIGNAL_DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const globalForDb = globalThis as unknown as { __signalDb?: Database.Database };

/**
 * The digests table. Shared by the fresh-database path and the rebuild below,
 * so the two can never drift apart.
 */
function digestsDdl(name: string) {
  return `
    CREATE TABLE IF NOT EXISTS ${name} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_key TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '', -- '' = the general digest, otherwise a categories.key
      title TEXT,
      subtitle TEXT,
      markdown TEXT,
      item_ids TEXT,                   -- JSON array
      status TEXT DEFAULT 'draft',     -- draft | approved
      model TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      language TEXT,
      UNIQUE (week_key, category)
    );`;
}

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

    -- Groups of sources. sources.category and channels.category store the key.
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,          -- stable slug, never renamed
      label TEXT NOT NULL,
      color TEXT DEFAULT '#8b93a1',
      digest_enabled INTEGER DEFAULT 0,  -- build a weekly digest for this category
      digest_items INTEGER DEFAULT 8,    -- top N scored items that feed it
      sort_order INTEGER DEFAULT 100,
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
      kind TEXT NOT NULL,              -- the stages that were asked for, joined by +
      status TEXT NOT NULL,            -- running | ok | error | interrupted
      week_key TEXT,                   -- the week the run worked on
      trigger TEXT,                    -- ui | cron | api
      stats TEXT,
      log TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      finished_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
  `);

  db.exec(digestsDdl("digests"));

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
  // Categories: a channel can write from a category's digest instead of the
  // general one, and digests are now one per week *and* category.
  ensureColumn(db, "channels", "category", "TEXT"); // NULL = the general digest
  migrateDigestCategory(db);
  // The run manager: which week a run worked on and who asked for it. Runs
  // recorded before the column existed already carry the week inside `stats`,
  // so the history does not start out blank.
  ensureColumn(db, "runs", "week_key", "TEXT");
  ensureColumn(db, "runs", "trigger", "TEXT");
  db.exec(
    `UPDATE runs SET week_key = json_extract(stats, '$.week')
      WHERE week_key IS NULL AND json_valid(stats) AND json_extract(stats, '$.week') IS NOT NULL`,
  );
}

function ensureColumn(db: Database.Database, table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

/**
 * Moves the digests' unique key from (week_key) to (week_key, category).
 * SQLite cannot alter a constraint, so the table is rebuilt — with foreign keys
 * off, because posts.digest_id is ON DELETE CASCADE and dropping the old table
 * with them on deletes every post. Ids are copied, so posts keep pointing at
 * the same digests. Exported for the test that runs it on a legacy file.
 */
export function migrateDigestCategory(db: Database.Database) {
  const cols = db.prepare("PRAGMA table_info(digests)").all() as { name: string }[];
  if (cols.some((c) => c.name === "category")) return;
  // Must be set outside the transaction: inside one, SQLite ignores it.
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      const count = (table: string) => (db.prepare(`SELECT COUNT(*) c FROM ${table}`).get() as { c: number }).c;
      db.exec(digestsDdl("digests_new"));
      db.exec(`
        INSERT INTO digests_new (id, week_key, category, title, subtitle, markdown, item_ids, status, model, created_at, language)
          SELECT id, week_key, '', title, subtitle, markdown, item_ids, status, model, created_at, language FROM digests;
      `);
      // Not PRAGMA foreign_key_check: it would also flag unrelated old dangling
      // references elsewhere and stop the app from booting.
      if (count("digests_new") !== count("digests")) throw new Error("digests rebuild lost rows");
      db.exec(`
        DROP TABLE digests;
        ALTER TABLE digests_new RENAME TO digests;
      `);
    })();
  } finally {
    db.pragma("foreign_keys = ON");
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

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
