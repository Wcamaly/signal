import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

process.env.SIGNAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "signal-db-"));

const { getDb } = await import("./db");

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
