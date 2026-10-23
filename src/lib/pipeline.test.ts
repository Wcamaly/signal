import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { Channel, DigestDef } from "./types";

// The due rules read the local calendar: pin the cluster's time zone.
process.env.TZ = "America/Argentina/Buenos_Aires";
// Demo mode whatever the shell exports: these tests must never call a real model.
for (const k of ["SIGNAL_LLM_PROVIDER", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY", "LLM_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"]) {
  delete process.env[k];
}
process.env.SIGNAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "signal-pipeline-"));

const { getDb } = await import("./db");
const { getChannels } = await import("./channels");
const { curateWeeks, dueTargets, groupChannelsByTarget, relaunchOptions, resolveTargets, runPipeline } =
  await import("./pipeline");
const { getRun, reconcileStaleRuns } = await import("./runs");

const THURSDAY = new Date(2026, 9, 22, 8, 0); // an ordinary day
const MONDAY = new Date(2026, 9, 26, 8, 0);
const FIRST = new Date(2026, 10, 1, 8, 0); // a Sunday, the 1st

const def = (key: string, cadence: DigestDef["cadence"], over: Partial<DigestDef> = {}): DigestDef => ({
  id: 0,
  key,
  label: key.toUpperCase(),
  kind: "items",
  cadence,
  categories: [],
  sources: [],
  item_count: 8,
  enabled: 1,
  sort_order: 100,
  ...over,
});
const DEFS = [def("general", "weekly"), def("daily", "daily"), def("monthly", "monthly"), def("off", "daily", { enabled: 0 })];
const pairs = (targets: { def: DigestDef; period: string }[]) => targets.map((t) => [t.def.key, t.period]);

const channel = (key: string, digestDef: string | null) =>
  ({ key, label: key.toUpperCase(), digest_def: digestDef }) as Channel;
const digest = (defKey: string, period: string) =>
  Number(
    getDb()
      .prepare("INSERT INTO digests (def_key, period_key, title) VALUES (?, ?, 't')")
      .run(defKey, period).lastInsertRowid,
  );

beforeEach(() => {
  getDb().exec("DELETE FROM posts; DELETE FROM digests; DELETE FROM runs;");
});

describe("dueTargets", () => {
  it("writes only the daily definitions on an ordinary day, for yesterday", () => {
    expect(pairs(dueTargets(DEFS, THURSDAY))).toEqual([["daily", "2026-10-21"]]);
  });

  it("adds the weekly ones on Monday, for the week that closed", () => {
    expect(pairs(dueTargets(DEFS, MONDAY))).toEqual([
      ["general", "2026-W43"],
      ["daily", "2026-10-25"],
    ]);
  });

  it("adds the monthly ones on the 1st, for the month that closed", () => {
    expect(pairs(dueTargets(DEFS, FIRST))).toEqual([
      ["daily", "2026-10-31"],
      ["monthly", "2026-10"],
    ]);
  });
});

describe("resolveTargets", () => {
  it("runs what is due when nothing is named", () => {
    expect(pairs(resolveTargets({}, DEFS, MONDAY))).toEqual(pairs(dueTargets(DEFS, MONDAY)));
  });

  it("writes named definitions for the period asked, previous by default, even a disabled one", () => {
    expect(pairs(resolveTargets({ defs: ["daily", "off"] }, DEFS, THURSDAY))).toEqual([
      ["daily", "2026-10-21"],
      ["off", "2026-10-21"],
    ]);
    expect(pairs(resolveTargets({ defs: ["general"], period: "current" }, DEFS, THURSDAY))).toEqual([
      ["general", "2026-W43"],
    ]);
    expect(pairs(resolveTargets({ defs: ["daily"], period: "2026-10-01" }, DEFS, THURSDAY))).toEqual([
      ["daily", "2026-10-01"],
    ]);
  });

  it("keeps the legacy week: every enabled weekly definition on that week", () => {
    expect(pairs(resolveTargets({ week: "previous" }, DEFS, MONDAY))).toEqual([["general", "2026-W43"]]);
  });

  it("replays exact pairs", () => {
    expect(pairs(resolveTargets({ targets: [{ def: "daily", period: "2026-10-05" }] }, DEFS, THURSDAY))).toEqual([
      ["daily", "2026-10-05"],
    ]);
  });

  it("refuses an unknown definition, a period of the wrong cadence, and a period without defs", () => {
    expect(() => resolveTargets({ defs: ["nope"] }, DEFS, THURSDAY)).toThrow('Unknown digest "nope"');
    expect(() => resolveTargets({ defs: ["daily"], period: "2026-W40" }, DEFS, THURSDAY)).toThrow(/Unknown daily period/);
    expect(() => resolveTargets({ period: "previous" }, DEFS, THURSDAY)).toThrow(/needs "defs"/);
  });
});

describe("curateWeeks", () => {
  it("curates the current week, and the one that closed on Monday", () => {
    expect(curateWeeks({}, [], THURSDAY)).toEqual(["2026-W43"]);
    expect(curateWeeks({}, [], MONDAY)).toEqual(["2026-W44", "2026-W43"]);
  });

  it("curates only the legacy week when one is given", () => {
    expect(curateWeeks({ week: "previous" }, [], MONDAY)).toEqual(["2026-W43"]);
  });

  it("adds the weeks a named digest covers", () => {
    const targets = resolveTargets({ defs: ["daily"], period: "2026-10-05" }, DEFS, THURSDAY);
    expect(curateWeeks({ defs: ["daily"] }, targets, THURSDAY)).toEqual(["2026-W43", "2026-W41"]);
  });
});

describe("groupChannelsByTarget", () => {
  const targets = [
    { def: def("general", "weekly"), period: "2026-W43" },
    { def: def("daily", "daily"), period: "2026-10-25" },
  ];

  it("sends each channel to the digest of its definition written in this run", () => {
    const plan = groupChannelsByTarget(
      targets,
      new Map([
        ["general", 11],
        ["daily", 12],
      ]),
      [channel("linkedin", null), channel("x", "general"), channel("pulse", "daily")],
    );
    expect(plan.skipped).toEqual([]);
    expect(plan.groups.map((g) => [g.digestId, g.channels.map((c) => c.key)])).toEqual([
      [11, ["linkedin", "x"]],
      [12, ["pulse"]],
    ]);
  });

  it("says nothing about a channel whose definition is not due", () => {
    const plan = groupChannelsByTarget(targets, new Map([["general", 11]]), [channel("monthly-news", "monthly")]);
    expect(plan).toEqual({ groups: [], skipped: [] });
  });

  it("warns about the channels of a due definition that was skipped", () => {
    const plan = groupChannelsByTarget(targets, new Map([["general", 11]]), [channel("pulse", "daily")]);
    expect(plan.skipped).toEqual(['Channels PULSE skipped: no "DAILY" digest for 2026-10-25.']);
  });

  it("uses the stored digest when the digest stage did not run", () => {
    const id = digest("daily", "2026-10-25");
    const plan = groupChannelsByTarget(targets, null, [channel("pulse", "daily"), channel("linkedin", null)]);
    expect(plan.groups.map((g) => g.digestId)).toEqual([id]);
    expect(plan.skipped).toEqual(['Channels LINKEDIN skipped: no "GENERAL" digest for 2026-W43.']);
  });
});

describe("runPipeline", () => {
  const db = () => getDb();

  beforeEach(() => {
    db().exec("DELETE FROM items; DELETE FROM sources; DELETE FROM digest_defs; DELETE FROM channels;");
    getChannels(); // seeds the shipped channels...
    db().exec("UPDATE channels SET enabled = 0"); // ...which these tests do not want
    db().exec(`
      INSERT INTO digest_defs (key, label, cadence, item_count, sort_order) VALUES
        ('general', 'General', 'weekly', 8, 0), ('pulse', 'Pulse', 'daily', 3, 10), ('month', 'Month', 'monthly', 3, 20);
      INSERT INTO channels (key, label, digest_def, posts_per_run, enabled) VALUES
        ('weekly-ch', 'Weekly', NULL, 1, 1), ('pulse-ch', 'Pulse', 'pulse', 1, 1), ('month-ch', 'Month', 'month', 1, 1);
      INSERT INTO items (external_id, title, url, week_key, score, status, published_at) VALUES
        ('a', 'Last week', 'https://a', '2026-W43', 80, 'selected', '2026-10-24T15:00:00.000Z'),
        ('b', 'Sunday', 'https://b', '2026-W43', 70, 'scored', '2026-10-25T15:00:00.000Z');
    `);
  });

  it("on a Monday writes the daily and the weekly digests, and posts only for them", async () => {
    const res = await runPipeline(["digest", "posts"], { now: MONDAY });
    expect(res.ok).toBe(true);
    expect(db().prepare("SELECT def_key, period_key FROM digests ORDER BY def_key").all()).toEqual([
      { def_key: "general", period_key: "2026-W43" },
      { def_key: "pulse", period_key: "2026-10-25" },
    ]);
    expect(
      (db().prepare("SELECT DISTINCT platform FROM posts ORDER BY platform").all() as { platform: string }[]).map(
        (r) => r.platform,
      ),
    ).toEqual(["pulse-ch", "weekly-ch"]);
    expect(res.log.join("\n")).not.toMatch(/MONTH|month-ch/i);
    expect(res.stats.targets).toEqual([
      { def: "general", period: "2026-W43" },
      { def: "pulse", period: "2026-10-25" },
    ]);
  });

  it("on an ordinary day with nothing scored skips the daily digest with a warning, and still succeeds", async () => {
    const res = await runPipeline(["digest", "posts"], { now: THURSDAY });
    expect(res.ok).toBe(true);
    expect(res.log).toContain('⚠ Digest "Pulse" 2026-10-21 skipped: no scored items.');
    expect(res.log).toContain('⚠ Channels Pulse skipped: no "Pulse" digest for 2026-10-21.');
    expect(db().prepare("SELECT COUNT(*) c FROM posts").get()).toEqual({ c: 0 });
  });

  it("keeps the legacy week working for the general digest", async () => {
    const res = await runPipeline(["digest"], { week: "2026-W43", now: THURSDAY });
    expect(res.ok).toBe(true);
    expect(db().prepare("SELECT def_key, period_key, week_key FROM digests").all()).toEqual([
      { def_key: "general", period_key: "2026-W43", week_key: "2026-W43" },
    ]);
  });

  it("records its targets as soon as the run opens, so an interrupted run can be replayed", async () => {
    const pending = runPipeline(["curate"], { defs: ["pulse"], period: "2026-10-20", now: THURSDAY });
    // Still in flight: nothing has finished, the process could die here.
    const open = db().prepare("SELECT id, status, stats FROM runs").get() as { id: number; status: string; stats: string };
    expect(open.status).toBe("running");
    expect(JSON.parse(open.stats)).toEqual({ week: "2026-W43", targets: [{ def: "pulse", period: "2026-10-20" }] });
    await pending;

    // The process died: the row stays with only what was written at the start.
    db().prepare("UPDATE runs SET status = 'running', started_at = datetime('now', '-2 hours'), stats = ? WHERE id = ?")
      .run(open.stats, open.id);
    reconcileStaleRuns();
    const run = getRun(open.id)!;
    expect(run.status).toBe("interrupted");
    expect(relaunchOptions(run)).toEqual({ targets: [{ def: "pulse", period: "2026-10-20" }] });
  });

  it("replays a run recorded before targets existed as the legacy week", () => {
    const id = Number(
      db()
        .prepare("INSERT INTO runs (kind, status, week_key, stats) VALUES ('digest', 'ok', '2026-W40', ?)")
        .run(JSON.stringify({ week: "2026-W40", digest: { digestId: 1 } })).lastInsertRowid,
    );
    expect(relaunchOptions(getRun(id)!)).toEqual({ week: "2026-W40" });
  });

  it("reports a bad request before opening a run", async () => {
    const res = await runPipeline(["digest"], { defs: ["nope"] });
    expect(res).toMatchObject({ ok: false, runId: null });
    expect(db().prepare("SELECT COUNT(*) c FROM runs").get()).toEqual({ c: 0 });
  });
});
