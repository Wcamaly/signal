import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

process.env.SIGNAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "signal-db-"));

const { getDb, migrateDigestCategory } = await import("./db");

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
 * `digests.week_key` was UNIQUE on its own. Moving the constraint to
 * (week_key, category) means rebuilding the table, and `posts.digest_id` is
 * ON DELETE CASCADE: dropping the old table with foreign keys on deletes every
 * post. These run against a file shaped like a database from before the change.
 */
describe("digests.category rebuild", () => {
  const legacy = () => {
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
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        digest_id INTEGER REFERENCES digests(id) ON DELETE CASCADE,
        platform TEXT NOT NULL,
        body TEXT NOT NULL
      );
      INSERT INTO digests (id, week_key, title, language) VALUES (7, '2026-W40', 'Old', 'English'), (9, '2026-W41', 'Older', NULL);
      INSERT INTO posts (digest_id, platform, body) VALUES (7, 'x', 'a'), (7, 'linkedin', 'b'), (9, 'x', 'c');
    `);
    return raw;
  };

  it("starts with foreign keys on, which is what makes the rebuild dangerous", () => {
    expect(legacy().pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("keeps every digest id, its data and every post", () => {
    const db = legacy();
    migrateDigestCategory(db);
    expect(db.prepare("SELECT id, week_key, category, title, language FROM digests ORDER BY id").all()).toEqual([
      { id: 7, week_key: "2026-W40", category: "", title: "Old", language: "English" },
      { id: 9, week_key: "2026-W41", category: "", title: "Older", language: null },
    ]);
    expect((db.prepare("SELECT COUNT(*) c FROM posts").get() as { c: number }).c).toBe(3);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("allows one digest per week and category", () => {
    const db = legacy();
    migrateDigestCategory(db);
    db.prepare("INSERT INTO digests (week_key, category, title) VALUES ('2026-W40', 'regulation', 'R')").run();
    expect(() =>
      db.prepare("INSERT INTO digests (week_key, category, title) VALUES ('2026-W40', '', 'Dup')").run(),
    ).toThrow(/UNIQUE/);
  });

  it("does nothing the second time", () => {
    const db = legacy();
    migrateDigestCategory(db);
    migrateDigestCategory(db);
    expect((db.prepare("SELECT COUNT(*) c FROM digests").get() as { c: number }).c).toBe(2);
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

  it("creates digests with a category on a fresh database", () => {
    expect(columns("digests")).toContain("category");
  });
});
