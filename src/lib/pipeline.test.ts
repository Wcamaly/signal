import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { Channel } from "./types";

process.env.SIGNAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "signal-pipeline-"));

const { getDb } = await import("./db");
const { groupChannelsByDigest } = await import("./pipeline");

const channel = (key: string, category: string | null) => ({ key, label: key.toUpperCase(), category }) as Channel;
const digest = (week: string, category: string) =>
  Number(
    getDb()
      .prepare("INSERT INTO digests (def_key, period_key, week_key, category, title) VALUES (?, ?, ?, ?, 't')")
      .run(category || "general", week, week, category).lastInsertRowid,
  );

beforeEach(() => {
  getDb().exec("DELETE FROM posts; DELETE FROM digests;");
});

describe("groupChannelsByDigest", () => {
  it("sends each channel to the digest of its category", () => {
    const general = digest("2026-W43", "");
    const reg = digest("2026-W43", "regulation");
    const plan = groupChannelsByDigest("2026-W43", [
      channel("linkedin", null),
      channel("x", null),
      channel("policy", "regulation"),
    ]);
    expect(plan.skipped).toEqual([]);
    expect(plan.groups.map((g) => [g.digestId, g.channels.map((c) => c.key)])).toEqual([
      [general, ["linkedin", "x"]],
      [reg, ["policy"]],
    ]);
  });

  it("skips a category channel whose digest does not exist this week", () => {
    digest("2026-W43", "");
    const plan = groupChannelsByDigest("2026-W43", [channel("linkedin", null), channel("policy", "regulation")]);
    expect(plan.groups.map((g) => g.channels.map((c) => c.key))).toEqual([["linkedin"]]);
    expect(plan.skipped).toEqual(['Channels POLICY skipped: no "regulation" digest for 2026-W43.']);
  });

  it("still fails when the general digest is missing", () => {
    digest("2026-W43", "regulation");
    expect(() => groupChannelsByDigest("2026-W43", [channel("linkedin", null)])).toThrow(
      "There is no digest for 2026-W43 yet.",
    );
  });

  it("does not need the general digest when no channel writes from it", () => {
    const reg = digest("2026-W43", "regulation");
    const plan = groupChannelsByDigest("2026-W43", [channel("policy", "regulation")]);
    expect(plan.groups.map((g) => g.digestId)).toEqual([reg]);
  });
});
