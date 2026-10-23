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
      def_key TEXT NOT NULL,           -- digest_defs.key that produced it
      period_key TEXT NOT NULL,        -- 2026-10-23 | 2026-W43 | 2026-10
      week_key TEXT,                   -- filled for weekly digests only
      category TEXT NOT NULL DEFAULT '', -- legacy: '' = general, otherwise the def key
      title TEXT,
      subtitle TEXT,
      markdown TEXT,
      item_ids TEXT,                   -- JSON array
      status TEXT DEFAULT 'draft',     -- draft | approved
      model TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      language TEXT,
      UNIQUE (def_key, period_key)
    );`;
}

/**
 * The definition key a pre-definitions digest or channel maps to: '' (and a
 * NULL channel binding) was the general digest; a category key becomes the
 * definition of the same key — except a category called `general`, which
 * would collide with the general definition.
 */
export function legacyDefKey(category: string | null | undefined): string {
  if (!category) return "general";
  return category === "general" ? "general-category" : category;
}

/** The same mapping, in SQL, for the backfills. */
const LEGACY_DEF_KEY_SQL = (column: string) =>
  `CASE WHEN ${column} IS NULL OR ${column} = '' THEN 'general' WHEN ${column} = 'general' THEN 'general-category' ELSE ${column} END`;

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

    -- What a digest is made of and how often: the general digest, a category's,
    -- a daily one... digests.def_key and channels.digest_def store the key.
    CREATE TABLE IF NOT EXISTS digest_defs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,          -- stable slug, never renamed
      label TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'items',     -- items | rollup (rollup: phase 2)
      cadence TEXT NOT NULL DEFAULT 'weekly', -- daily | weekly | monthly
      categories TEXT DEFAULT '[]',      -- items: JSON array of category keys; [] = every category
      sources TEXT DEFAULT '[]',         -- rollup: JSON array of digest_defs keys
      item_count INTEGER DEFAULT 8,      -- items: top N (1..30)
      enabled INTEGER DEFAULT 1,
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
  ensureColumn(db, "channels", "category", "TEXT"); // unused since digest definitions
  // Digest definitions: one digest per definition and period, and a channel
  // writes from a definition.
  ensureColumn(db, "channels", "digest_def", "TEXT"); // NULL = the general definition
  migrateDigests(db);
  seedLegacyDigestDefs(db);
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
 * Moves the digests' unique key to (def_key, period_key), from either older
 * shape: (week_key) before categories, or (week_key, category) after them.
 * SQLite cannot alter a constraint, so the table is rebuilt — with foreign keys
 * off, because posts.digest_id is ON DELETE CASCADE and dropping the old table
 * with them on deletes every post. Ids are copied, so posts keep pointing at
 * the same digests. Exported for the test that runs it on legacy files.
 */
export function migrateDigests(db: Database.Database) {
  const cols = (db.prepare("PRAGMA table_info(digests)").all() as { name: string }[]).map((c) => c.name);
  if (cols.includes("def_key")) return;
  const category = cols.includes("category") ? "category" : "''";
  // Must be set outside the transaction: inside one, SQLite ignores it.
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      const count = (table: string) => (db.prepare(`SELECT COUNT(*) c FROM ${table}`).get() as { c: number }).c;
      db.exec(digestsDdl("digests_new"));
      db.exec(`
        INSERT INTO digests_new (id, def_key, period_key, week_key, category, title, subtitle, markdown, item_ids, status, model, created_at, language)
          SELECT id, ${LEGACY_DEF_KEY_SQL(category)}, week_key, week_key, ${category}, title, subtitle, markdown, item_ids, status, model, created_at, language
          FROM digests;
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

/**
 * First boot with digest definitions — the table is still empty. Creates the
 * general definition, one weekly definition per category that had its digest
 * turned on (or that a channel was bound to, disabled when its digest was off,
 * so the channel keeps writing nothing rather than switching to the general
 * digest), and points each channel at its definition. Runs once: `general`
 * can never be deleted, so the table is never empty again. Exported for tests.
 */
export function seedLegacyDigestDefs(db: Database.Database) {
  if ((db.prepare("SELECT COUNT(*) c FROM digest_defs").get() as { c: number }).c) return;
  const raw = db.prepare("SELECT value FROM settings WHERE key = 'signals_per_week'").get() as
    | { value: string }
    | undefined;
  const perWeek = clampItemCount(parseJson<unknown>(raw?.value, 8));
  db.transaction(() => {
    db.prepare(
      `INSERT INTO digest_defs (key, label, kind, cadence, categories, item_count, enabled, sort_order)
       VALUES ('general', 'General', 'items', 'weekly', '[]', ?, 1, 0)`,
    ).run(perWeek);
    const categories = db
      .prepare(
        `SELECT key, label, digest_enabled, digest_items, sort_order FROM categories
         WHERE digest_enabled = 1 OR key IN (SELECT category FROM channels WHERE category IS NOT NULL)
         ORDER BY sort_order, label`,
      )
      .all() as { key: string; label: string; digest_enabled: number; digest_items: number | null; sort_order: number }[];
    const insert = db.prepare(
      `INSERT INTO digest_defs (key, label, kind, cadence, categories, item_count, enabled, sort_order)
       VALUES (?, ?, 'items', 'weekly', ?, ?, ?, ?) ON CONFLICT(key) DO NOTHING`,
    );
    for (const c of categories) {
      const label = c.key === "general" ? `${c.label} (category)` : c.label;
      insert.run(
        legacyDefKey(c.key),
        label,
        JSON.stringify([c.key]),
        clampItemCount(c.digest_items),
        c.digest_enabled ? 1 : 0,
        c.sort_order,
      );
    }
    db.exec(
      `UPDATE channels SET digest_def = ${LEGACY_DEF_KEY_SQL("category")}
       WHERE category IS NOT NULL AND category != '' AND digest_def IS NULL`,
    );
  })();
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

/**
 * A digest's item count, 1..30. Anything that is not a number (NULL, a word,
 * NaN) falls back to 8; a number out of range is clamped, so 0 becomes 1.
 * Lives here, not in digest-defs.ts, because the boot-time seed needs it.
 */
export function clampItemCount(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.min(30, Math.max(1, Math.round(n))) : 8;
}

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
