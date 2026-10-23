import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

process.env.SIGNAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "signal-db-"));

const { getDb, legacyDefKey, migrateDigests, seedLegacyDigestDefs } = await import("./db");

/**
 * The migration has already run by the time `getDb()` returns, so the backfill
 * is exercised against a database shaped like the one it was written for: rows
 * inserted before `week_key` existed, carrying the week inside `stats`.
 */
describe("runs.week_key backfill", () => {
  const legacyRow = (stats: string | null) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-legacy-"));
    const file = path.join(dir, "signal.db");
    const raw = new Database(file);
    raw.exec(`CREATE TABLE runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      stats TEXT,
      log TEXT,
      started_at TEXT,
      finished_at TEXT
    )`);
    raw.prepare("INSERT INTO runs (kind, status, stats) VALUES ('ingest', 'ok', ?)").run(stats);
    raw.close();
    return file;
  };

  /** Replays what init() does to an old database, without booting the module twice. */
  const migrate = (file: string) => {
    const db = new Database(file);
    db.exec("ALTER TABLE runs ADD COLUMN week_key TEXT");
    db.exec(
      `UPDATE runs SET week_key = json_extract(stats, '$.week')
        WHERE week_key IS NULL AND json_valid(stats) AND json_extract(stats, '$.week') IS NOT NULL`,
    );
    const row = db.prepare("SELECT week_key FROM runs").get() as { week_key: string | null };
    db.close();
    return row.week_key;
  };

  it("recovers the week a past run worked on", () => {
    expect(migrate(legacyRow('{"week":"2026-W36","ingest":{"inserted":4}}'))).toBe("2026-W36");
  });

  it("leaves a run that recorded no stats without a week", () => {
    expect(migrate(legacyRow(null))).toBeNull();
  });

  it("does not choke on stats that are not valid JSON", () => {
    expect(migrate(legacyRow("not json"))).toBeNull();
  });

  it("leaves a run whose stats carry no week alone", () => {
    expect(migrate(legacyRow('{"ingest":{"inserted":4}}'))).toBeNull();
  });
});

describe("schema", () => {
  it("gives runs the columns the run manager reads", () => {
    const columns = (getDb().prepare("PRAGMA table_info(runs)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(columns).toEqual(expect.arrayContaining(["week_key", "trigger", "status", "kind"]));
  });
});

/**
 * The digests' unique key moves to (def_key, period_key). That means
 * rebuilding the table, and `posts.digest_id` is ON DELETE CASCADE: dropping
 * the old table with foreign keys on deletes every post. These run against
 * files shaped like the two older databases: before categories (week_key
 * UNIQUE) and after them (UNIQUE week_key, category).
 */
describe("digests rebuild", () => {
  const POSTS = `
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      digest_id INTEGER REFERENCES digests(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      body TEXT NOT NULL
    );`;

  const beforeCategories = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-digests-"));
    const raw = new Database(path.join(dir, "signal.db"));
    raw.exec(`
      CREATE TABLE digests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        week_key TEXT NOT NULL UNIQUE,
        title TEXT, subtitle TEXT, markdown TEXT, item_ids TEXT,
        status TEXT DEFAULT 'draft', model TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        language TEXT
      );
      ${POSTS}
      INSERT INTO digests (id, week_key, title, language) VALUES (7, '2026-W40', 'Old', 'English'), (9, '2026-W41', 'Older', NULL);
      INSERT INTO posts (digest_id, platform, body) VALUES (7, 'x', 'a'), (7, 'linkedin', 'b'), (9, 'x', 'c');
    `);
    return raw;
  };

  const withCategories = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-digests-"));
    const raw = new Database(path.join(dir, "signal.db"));
    raw.exec(`
      CREATE TABLE digests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        week_key TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT '',
        title TEXT, subtitle TEXT, markdown TEXT, item_ids TEXT,
        status TEXT DEFAULT 'draft', model TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        language TEXT,
        UNIQUE (week_key, category)
      );
      ${POSTS}
      INSERT INTO digests (id, week_key, category, title) VALUES
        (3, '2026-W42', '', 'G'), (4, '2026-W42', 'regulation', 'R'), (5, '2026-W42', 'general', 'GC');
      INSERT INTO posts (digest_id, platform, body) VALUES (3, 'x', 'a'), (4, 'policy', 'b'), (5, 'x', 'c');
    `);
    return raw;
  };

  it("starts with foreign keys on, which is what makes the rebuild dangerous", () => {
    expect(beforeCategories().pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("keeps every digest id, its data and every post — from before categories", () => {
    const db = beforeCategories();
    migrateDigests(db);
    expect(
      db.prepare("SELECT id, def_key, period_key, week_key, category, title, language FROM digests ORDER BY id").all(),
    ).toEqual([
      { id: 7, def_key: "general", period_key: "2026-W40", week_key: "2026-W40", category: "", title: "Old", language: "English" },
      { id: 9, def_key: "general", period_key: "2026-W41", week_key: "2026-W41", category: "", title: "Older", language: null },
    ]);
    expect((db.prepare("SELECT COUNT(*) c FROM posts").get() as { c: number }).c).toBe(3);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("maps each category digest to the definition of the same key — from after categories", () => {
    const db = withCategories();
    migrateDigests(db);
    expect(db.prepare("SELECT id, def_key, period_key, category FROM digests ORDER BY id").all()).toEqual([
      { id: 3, def_key: "general", period_key: "2026-W42", category: "" },
      { id: 4, def_key: "regulation", period_key: "2026-W42", category: "regulation" },
      // A category called "general" must not collide with the general digest.
      { id: 5, def_key: "general-category", period_key: "2026-W42", category: "general" },
    ]);
    expect((db.prepare("SELECT COUNT(*) c FROM posts").get() as { c: number }).c).toBe(3);
  });

  it("allows one digest per definition and period", () => {
    const db = beforeCategories();
    migrateDigests(db);
    db.prepare("INSERT INTO digests (def_key, period_key, title) VALUES ('daily', '2026-10-05', 'D')").run();
    db.prepare("INSERT INTO digests (def_key, period_key, title) VALUES ('general', '2026-W42', 'G')").run();
    expect(() =>
      db.prepare("INSERT INTO digests (def_key, period_key, title) VALUES ('general', '2026-W40', 'Dup')").run(),
    ).toThrow(/UNIQUE/);
  });

  it("does nothing the second time", () => {
    const db = withCategories();
    migrateDigests(db);
    migrateDigests(db);
    expect((db.prepare("SELECT COUNT(*) c FROM digests").get() as { c: number }).c).toBe(3);
  });
});

describe("definitions from the category digests", () => {
  /** A database from after categories, once the new tables and columns exist. */
  const legacy = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-defs-"));
    const raw = new Database(path.join(dir, "signal.db"));
    raw.exec(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
        digest_enabled INTEGER DEFAULT 0, digest_items INTEGER DEFAULT 8, sort_order INTEGER DEFAULT 100
      );
      CREATE TABLE channels (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, category TEXT, digest_def TEXT);
      CREATE TABLE digest_defs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'items', cadence TEXT NOT NULL DEFAULT 'weekly',
        categories TEXT DEFAULT '[]', sources TEXT DEFAULT '[]', item_count INTEGER DEFAULT 8,
        enabled INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 100, created_at TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO settings (key, value) VALUES ('signals_per_week', '6');
      INSERT INTO categories (key, label, digest_enabled, digest_items, sort_order) VALUES
        ('regulation', 'Regulation', 1, 5, 10), ('labs', 'Labs', 0, 8, 20), ('press', 'Press', 0, 8, 30);
      INSERT INTO channels (key, category) VALUES ('linkedin', NULL), ('policy', 'regulation'), ('labsfeed', 'labs');
    `);
    return raw;
  };

  const defs = (db: Database.Database) =>
    db.prepare("SELECT key, label, cadence, categories, item_count, enabled FROM digest_defs ORDER BY sort_order, key").all();

  it("creates general from signals_per_week and one weekly definition per category digest", () => {
    const db = legacy();
    seedLegacyDigestDefs(db);
    expect(defs(db)).toEqual([
      { key: "general", label: "General", cadence: "weekly", categories: "[]", item_count: 6, enabled: 1 },
      { key: "regulation", label: "Regulation", cadence: "weekly", categories: '["regulation"]', item_count: 5, enabled: 1 },
      // Digest off, but a channel was bound to it: kept, disabled, so the channel still writes nothing.
      { key: "labs", label: "Labs", cadence: "weekly", categories: '["labs"]', item_count: 8, enabled: 0 },
    ]);
  });

  it("points each bound channel at its definition", () => {
    const db = legacy();
    seedLegacyDigestDefs(db);
    expect(db.prepare("SELECT key, digest_def FROM channels ORDER BY id").all()).toEqual([
      { key: "linkedin", digest_def: null },
      { key: "policy", digest_def: "regulation" },
      { key: "labsfeed", digest_def: "labs" },
    ]);
  });

  it("boots on a signals_per_week that is not JSON and on odd digest_items", () => {
    const db = legacy();
    db.exec(`
      UPDATE settings SET value = 'eight' WHERE key = 'signals_per_week';
      UPDATE categories SET digest_items = NULL WHERE key = 'regulation';
      UPDATE categories SET digest_enabled = 1, digest_items = 99 WHERE key = 'labs';
      UPDATE categories SET digest_enabled = 1, digest_items = 0 WHERE key = 'press';
    `);
    expect(() => seedLegacyDigestDefs(db)).not.toThrow();
    const counts = Object.fromEntries(
      (db.prepare("SELECT key, item_count FROM digest_defs").all() as { key: string; item_count: number }[]).map(
        (r) => [r.key, r.item_count],
      ),
    );
    expect(counts).toEqual({ general: 8, regulation: 8, labs: 30, press: 1 });
  });

  it("runs only once: a definition deleted later does not come back", () => {
    const db = legacy();
    seedLegacyDigestDefs(db);
    db.prepare("DELETE FROM digest_defs WHERE key = 'regulation'").run();
    db.prepare("UPDATE channels SET digest_def = NULL WHERE key = 'policy'").run();
    seedLegacyDigestDefs(db);
    expect(db.prepare("SELECT COUNT(*) c FROM digest_defs WHERE key = 'regulation'").get()).toEqual({ c: 0 });
    expect(db.prepare("SELECT digest_def FROM channels WHERE key = 'policy'").get()).toEqual({ digest_def: null });
  });
});

describe("legacyDefKey", () => {
  it("maps the general digest, a category and a category called general", () => {
    expect([legacyDefKey(null), legacyDefKey(""), legacyDefKey("labs"), legacyDefKey("general")]).toEqual([
      "general",
      "general",
      "labs",
      "general-category",
    ]);
  });
});

describe("category schema", () => {
  const columns = (table: string) =>
    (getDb().prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

  it("has a categories table", () => {
    expect(columns("categories")).toEqual(
      expect.arrayContaining(["key", "label", "color", "digest_enabled", "digest_items", "sort_order"]),
    );
  });

  it("lets a channel point at a category", () => {
    expect(columns("channels")).toContain("category");
  });

  it("creates digests keyed by definition and period on a fresh database", () => {
    expect(columns("digests")).toEqual(expect.arrayContaining(["def_key", "period_key", "week_key", "category"]));
  });

  it("has digest definitions, with general seeded, and a channel binding to one", () => {
    expect(columns("digest_defs")).toEqual(
      expect.arrayContaining(["key", "label", "kind", "cadence", "categories", "sources", "item_count", "enabled"]),
    );
    expect(getDb().prepare("SELECT key FROM digest_defs").all()).toEqual([{ key: "general" }]);
    expect(columns("channels")).toContain("digest_def");
  });
});
