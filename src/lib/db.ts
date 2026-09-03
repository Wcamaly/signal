import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = process.env.SIGNAL_DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const globalForDb = globalThis as unknown as { __signalDb?: Database.Database };

function init(db: Database.Database) {
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,              -- rss | hn | arxiv | github
      category TEXT DEFAULT 'general', -- labs | research | product | community | business
      weight REAL DEFAULT 1.0,
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
      score REAL,                      -- 0..100 asignado por el curador
      why TEXT,                        -- por qué importa (curador)
      angle TEXT,                      -- ángulo editorial sugerido
      topics TEXT,                     -- JSON array
      cluster TEXT,                    -- nombre de la historia agrupada
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
      platform TEXT NOT NULL,          -- linkedin | x | instagram
      angle TEXT,
      hook TEXT,
      body TEXT NOT NULL,
      hashtags TEXT,
      visual_brief TEXT,               -- brief de imagen (instagram / carrusel)
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

/* ---------- misc ---------- */

export function weekKey(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
