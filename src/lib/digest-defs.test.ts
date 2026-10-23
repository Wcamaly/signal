import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

process.env.SIGNAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "signal-defs-"));

const { getDb, setSetting } = await import("./db");
const { deleteCategory, getCategories } = await import("./categories");
const { deleteDigestDef, getDigestDef, getDigestDefs, saveDigestDef } = await import("./digest-defs");

const db = () => getDb();
const input = (over: Partial<Parameters<typeof saveDigestDef>[0]> = {}) => ({
  label: "AI daily",
  cadence: "daily" as const,
  categories: [] as string[],
  item_count: 5,
  enabled: true,
  ...over,
});

beforeEach(() => {
  db().exec("DELETE FROM digest_defs; DELETE FROM channels; DELETE FROM categories; DELETE FROM settings;");
  getCategories(); // the shipped categories: labs, regulation, press...
});

describe("seeding", () => {
  it("creates general, weekly over every category, sized by signals_per_week", () => {
    setSetting("signals_per_week", 6);
    expect(getDigestDefs()).toEqual([
      expect.objectContaining({ key: "general", kind: "items", cadence: "weekly", categories: [], item_count: 6, enabled: 1 }),
    ]);
  });

  it("never overwrites an edited general", () => {
    getDigestDefs();
    saveDigestDef(input({ key: "general", label: "Everything", cadence: "weekly", item_count: 12 }));
    setSetting("signals_per_week", 3);
    expect(getDigestDef("general")).toMatchObject({ label: "Everything", item_count: 12 });
  });
});

describe("saveDigestDef", () => {
  it("derives the key from the name and stores the categories as a list", () => {
    const key = saveDigestDef(input({ label: "Regulación diaria", categories: ["regulation", "regulation"] }));
    expect(key).toBe("regulacion-diaria");
    expect(getDigestDef(key)).toMatchObject({ cadence: "daily", categories: ["regulation"], item_count: 5 });
  });

  it("refuses a duplicate key, an unknown category, an empty name and a bad cadence", () => {
    saveDigestDef(input());
    expect(() => saveDigestDef(input())).toThrow(/already exists/);
    expect(() => saveDigestDef(input({ label: "X", categories: ["nope"] }))).toThrow('Unknown category "nope"');
    expect(() => saveDigestDef(input({ label: " " }))).toThrow(/needs a name/);
    expect(() => saveDigestDef(input({ label: "Y", cadence: "hourly" as never }))).toThrow(/Unknown cadence/);
  });

  it("refuses roll-ups in phase 1", () => {
    expect(() => saveDigestDef(input({ label: "Monthly", kind: "rollup" }))).toThrow(/Roll-up/);
  });

  it("keeps the key when renaming and clamps the item count", () => {
    const key = saveDigestDef(input());
    saveDigestDef(input({ key, label: "Renamed", item_count: 99, enabled: false }));
    expect(getDigestDef(key)).toMatchObject({ label: "Renamed", item_count: 30, enabled: 0 });
  });
});

describe("deleteDigestDef", () => {
  it("sends its channels back to general and leaves its digests in the archive", () => {
    const key = saveDigestDef(input());
    db().prepare("INSERT INTO channels (key, label, digest_def) VALUES ('daily-x', 'X', ?)").run(key);
    db().prepare("INSERT INTO digests (def_key, period_key, title) VALUES (?, '2026-10-22', 't')").run(key);
    deleteDigestDef(key);
    expect(getDigestDef(key)).toBeUndefined();
    expect(db().prepare("SELECT digest_def FROM channels WHERE key = 'daily-x'").get()).toEqual({ digest_def: null });
    expect(db().prepare("SELECT COUNT(*) c FROM digests WHERE def_key = ?").get(key)).toEqual({ c: 1 });
  });

  it("takes it out of every roll-up's sources", () => {
    const key = saveDigestDef(input());
    db()
      .prepare("INSERT INTO digest_defs (key, label, kind, cadence, sources) VALUES ('month', 'Month', 'rollup', 'monthly', ?)")
      .run(JSON.stringify([key, "general"]));
    deleteDigestDef(key);
    expect(getDigestDef("month")?.sources).toEqual(["general"]);
  });

  it("refuses to delete general", () => {
    getDigestDefs();
    expect(() => deleteDigestDef("general")).toThrow(/general/);
  });
});

describe("deleting a category", () => {
  it("removes it from every definition and disables one left with none", () => {
    const both = saveDigestDef(input({ label: "Both", categories: ["regulation", "labs"] }));
    const only = saveDigestDef(input({ label: "Only", categories: ["regulation"] }));
    expect(deleteCategory("regulation")).toEqual(["Only"]);
    expect(getDigestDef(both)).toMatchObject({ categories: ["labs"], enabled: 1 });
    expect(getDigestDef(only)).toMatchObject({ categories: [], enabled: 0 });
  });
});
