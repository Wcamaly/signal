import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

process.env.SIGNAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "signal-digest-"));

const { getDb } = await import("../db");
const { categoryDigestItems, saveDigest } = await import("./digest");

const db = () => getDb();
let n = 0;
const source = (category: string) =>
  Number(
    db()
      .prepare("INSERT INTO sources (name, url, kind, category) VALUES (?, ?, 'rss', ?)")
      .run(`s${++n}`, `https://example.com/${n}`, category).lastInsertRowid,
  );
const item = (sourceId: number, week: string, score: number | null, status = "scored") =>
  db()
    .prepare(
      "INSERT INTO items (source_id, external_id, title, url, week_key, score, status) VALUES (?, ?, ?, 'u', ?, ?, ?)",
    )
    .run(sourceId, `e${++n}`, `t${n}`, week, score, status);

beforeEach(() => {
  db().exec("DELETE FROM posts; DELETE FROM digests; DELETE FROM items; DELETE FROM sources;");
});

describe("categoryDigestItems", () => {
  it("takes the top N scored items of the category in that week, selected or not", () => {
    const reg = source("regulation");
    const labs = source("labs");
    item(reg, "2026-W43", 40, "used");
    item(reg, "2026-W43", 80, "rejected"); // rejected on the radar: out
    item(reg, "2026-W43", 90, "selected");
    item(reg, "2026-W43", 70);
    item(reg, "2026-W43", null, "new"); // not scored: out
    item(reg, "2026-W42", 99); // other week: out
    item(labs, "2026-W43", 95); // other category: out

    expect(categoryDigestItems("2026-W43", "regulation", 2).map((i) => i.score)).toEqual([90, 70]);
    expect(categoryDigestItems("2026-W43", "regulation", 10).map((i) => i.score)).toEqual([90, 70, 40]);
  });

  it("is empty for a category with nothing scored", () => {
    expect(categoryDigestItems("2026-W43", "research", 8)).toEqual([]);
  });
});

describe("saveDigest", () => {
  const result = (title: string) => ({ title, subtitle: "s", markdown: "m" });

  it("keeps two definitions of the same period apart", () => {
    const general = saveDigest("general", "2026-W43", result("G"), [], "English");
    const reg = saveDigest("regulation", "2026-W43", result("R"), [], "English");
    expect(general).not.toBe(reg);
  });

  it("rewrites the same row when run again for the same definition and period", () => {
    const first = saveDigest("regulation", "2026-W43", result("R1"), [], "English");
    const second = saveDigest("regulation", "2026-W43", result("R2"), [], "English");
    expect(second).toBe(first);
    expect(db().prepare("SELECT title FROM digests WHERE id = ?").get(first)).toEqual({ title: "R2" });
  });

  it("fills week_key for a weekly period only, and the legacy category", () => {
    const weekly = saveDigest("general", "2026-W43", result("W"), [], "English");
    const daily = saveDigest("ai-daily", "2026-10-22", result("D"), [], "English");
    expect(db().prepare("SELECT week_key, category FROM digests WHERE id = ?").get(weekly)).toEqual({
      week_key: "2026-W43",
      category: "",
    });
    expect(db().prepare("SELECT week_key, category FROM digests WHERE id = ?").get(daily)).toEqual({
      week_key: null,
      category: "ai-daily",
    });
  });
});
