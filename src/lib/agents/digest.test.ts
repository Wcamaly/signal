import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { DigestDef } from "../types";

// Day boundaries follow the process time zone; pin the cluster's.
process.env.TZ = "America/Argentina/Buenos_Aires";
// Demo mode whatever the shell exports: these tests must never call a real model.
for (const k of ["SIGNAL_LLM_PROVIDER", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY", "LLM_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"]) {
  delete process.env[k];
}
process.env.SIGNAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "signal-digest-"));

const { getDb } = await import("../db");
const { llmReady } = await import("../llm");
const { getVoice } = await import("../pipeline");
const { buildDigestFor, digestItems, saveDigest } = await import("./digest");

const db = () => getDb();
let n = 0;
const source = (category: string) =>
  Number(
    db()
      .prepare("INSERT INTO sources (name, url, kind, category) VALUES (?, ?, 'rss', ?)")
      .run(`s${++n}`, `https://example.com/${n}`, category).lastInsertRowid,
  );
const item = (sourceId: number, week: string, score: number | null, status = "scored", published: string | null = null) =>
  db()
    .prepare(
      "INSERT INTO items (source_id, external_id, title, url, week_key, score, status, published_at) VALUES (?, ?, ?, 'u', ?, ?, ?, ?)",
    )
    .run(sourceId, `e${++n}`, `t${n}`, week, score, status, published);

const def = (over: Partial<DigestDef> = {}): DigestDef => ({
  id: 1,
  key: "general",
  label: "General",
  kind: "items",
  cadence: "weekly",
  categories: [],
  sources: [],
  item_count: 8,
  enabled: 1,
  sort_order: 0,
  ...over,
});

beforeEach(() => {
  db().exec("DELETE FROM posts; DELETE FROM digests; DELETE FROM items; DELETE FROM sources;");
});

describe("digestItems", () => {
  it("puts the curator's picks first, then the best scored, and never a rejected item", () => {
    const labs = source("labs");
    item(labs, "2026-W43", 95);
    item(labs, "2026-W43", 60, "selected");
    item(labs, "2026-W43", 99, "rejected");
    item(labs, "2026-W43", 50, "used"); // already written about: still one of the picks
    item(labs, "2026-W43", null, "new"); // not scored: out
    item(labs, "2026-W42", 98); // other week: out
    expect(digestItems(def(), "2026-W43").map((i) => i.score)).toEqual([60, 50, 95]);
    expect(digestItems(def({ item_count: 2 }), "2026-W43").map((i) => i.score)).toEqual([60, 50]);
  });

  it("keeps to the definition's categories", () => {
    const reg = source("regulation");
    const press = source("press");
    const labs = source("labs");
    item(reg, "2026-W43", 70);
    item(press, "2026-W43", 80);
    item(labs, "2026-W43", 90);
    expect(digestItems(def({ categories: ["regulation", "press"] }), "2026-W43").map((i) => i.score)).toEqual([80, 70]);
  });

  it("takes a day by published_at, in local time", () => {
    const labs = source("labs");
    // 2026-10-22 in Buenos Aires runs from 03:00Z on the 22nd to 03:00Z on the 23rd.
    item(labs, "2026-W43", 70, "scored", "2026-10-22T03:00:00.000Z");
    item(labs, "2026-W43", 80, "scored", "2026-10-23T02:59:59.000Z");
    item(labs, "2026-W43", 90, "scored", "2026-10-22T02:59:59.000Z"); // still the 21st locally
    item(labs, "2026-W43", 99, "scored", "2026-10-23T03:00:00.000Z"); // already the 23rd
    expect(digestItems(def({ cadence: "daily" }), "2026-10-22").map((i) => i.score)).toEqual([80, 70]);
  });

  it("takes a month by published_at", () => {
    const labs = source("labs");
    item(labs, "2026-W40", 70, "scored", "2026-10-01T03:00:00.000Z");
    item(labs, "2026-W40", 80, "scored", "2026-09-30T12:00:00.000Z");
    expect(digestItems(def({ cadence: "monthly" }), "2026-10").map((i) => i.score)).toEqual([70]);
  });
});

describe("buildDigestFor", () => {
  it("runs in demo mode here", () => {
    expect(llmReady()).toBe(false);
  });

  it("skips a period with nothing scored", async () => {
    expect(await buildDigestFor(def(), "2026-W43", getVoice())).toEqual({ skipped: true });
  });

  it("writes the digest under the definition and the period", async () => {
    const labs = source("labs");
    item(labs, "2026-W43", 70, "scored", "2026-10-22T12:00:00.000Z");
    const r = await buildDigestFor(def({ key: "labs-daily", label: "Labs daily", cadence: "daily", categories: ["labs"] }), "2026-10-22", getVoice());
    expect(r).toMatchObject({ items: 1 });
    expect(db().prepare("SELECT def_key, period_key, week_key, title FROM digests").get()).toEqual({
      def_key: "labs-daily",
      period_key: "2026-10-22",
      week_key: null,
      title: "Labs daily — 2026-10-22",
    });
  });

  it("refuses a roll-up", async () => {
    await expect(buildDigestFor(def({ kind: "rollup" }), "2026-10", getVoice())).rejects.toThrow(/roll-up/);
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
