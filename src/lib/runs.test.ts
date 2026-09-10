import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

// The database module resolves its directory at import time, so the temporary
// one has to be in place before it loads.
process.env.SIGNAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "signal-runs-"));

const { getDb } = await import("./db");
const {
  activeRun,
  countRuns,
  finishRun,
  getRun,
  listRuns,
  reconcileStaleRuns,
  runStages,
  runStats,
  runWeeks,
  startRun,
} = await import("./runs");

type RunRow = {
  kind: string;
  status: string;
  week_key: string | null;
  trigger: string | null;
  stats: string | null;
  log: string | null;
};

const insert = (row: {
  kind: string;
  status: string;
  week?: string;
  startedMinutesAgo?: number;
  finishedMinutesAgo?: number;
  log?: string;
}) =>
  Number(
    getDb()
      .prepare(
        `INSERT INTO runs (kind, status, week_key, trigger, log, started_at, finished_at)
         VALUES (?, ?, ?, 'cron', ?, datetime('now', ?), ${
           row.finishedMinutesAgo === undefined ? "NULL" : "datetime('now', ?)"
         })`,
      )
      .run(
        ...[
          row.kind,
          row.status,
          row.week ?? "2026-W37",
          row.log ?? null,
          `-${row.startedMinutesAgo ?? 0} minutes`,
          ...(row.finishedMinutesAgo === undefined ? [] : [`-${row.finishedMinutesAgo} minutes`]),
        ],
      ).lastInsertRowid,
  );

beforeEach(() => {
  getDb().exec("DELETE FROM runs");
});

describe("startRun", () => {
  it("opens a run with its stages, week and trigger", () => {
    const id = startRun({ stages: ["ingest", "curate"], week: "2026-W36", trigger: "cron" });

    const row = getDb().prepare("SELECT * FROM runs WHERE id = ?").get(id) as RunRow;
    expect(row).toMatchObject({
      kind: "ingest+curate",
      status: "running",
      week_key: "2026-W36",
      trigger: "cron",
    });
  });

  it("refuses a second run while one is in flight, and says which one blocks it", () => {
    const first = startRun({ stages: ["ingest"], week: "2026-W36", trigger: "ui" });

    expect(() => startRun({ stages: ["curate"], week: "2026-W36", trigger: "cron" })).toThrow(
      new RegExp(`Run #${first} \\(ingest\\) is already in flight`),
    );
    expect(countRuns()).toBe(1);
  });

  it("lets the next run start once the previous one is closed", () => {
    const first = startRun({ stages: ["ingest"], week: "2026-W36", trigger: "ui" });
    finishRun(first, { status: "ok", stats: {}, log: [] });

    expect(() => startRun({ stages: ["curate"], week: "2026-W36", trigger: "ui" })).not.toThrow();
  });

  it("is not blocked by a run whose process died", () => {
    insert({ kind: "ingest+curate", status: "running", startedMinutesAgo: 45 });

    expect(() => startRun({ stages: ["ingest"], week: "2026-W37", trigger: "ui" })).not.toThrow();
  });
});

describe("finishRun", () => {
  it("stores the outcome, the stats as JSON and the log as lines", () => {
    const id = startRun({ stages: ["ingest"], week: "2026-W37", trigger: "ui" });

    finishRun(id, { status: "error", stats: { week: "2026-W37", ingest: { inserted: 4 } }, log: ["a", "b"] });

    const row = getDb().prepare("SELECT * FROM runs WHERE id = ?").get(id) as RunRow & {
      finished_at: string | null;
    };
    expect(row.status).toBe("error");
    expect(row.log).toBe("a\nb");
    expect(JSON.parse(row.stats!)).toEqual({ week: "2026-W37", ingest: { inserted: 4 } });
    expect(row.finished_at).not.toBeNull();
  });
});

describe("reconcileStaleRuns", () => {
  it("closes a run left running past the window and reports how many", () => {
    const stale = insert({ kind: "ingest", status: "running", startedMinutesAgo: 45, log: "Ingest: 3 new" });

    expect(reconcileStaleRuns(30)).toBe(1);

    const row = getRun(stale)!;
    expect(row.status).toBe("interrupted");
    expect(row.log).toBe("Ingest: 3 new\n✖ Interrupted: no result after 30 minutes.");
    expect(row.finished_at).not.toBeNull();
  });

  it("leaves a run that is still within the window alone", () => {
    const fresh = insert({ kind: "curate", status: "running", startedMinutesAgo: 5 });

    expect(reconcileStaleRuns(30)).toBe(0);
    expect(getRun(fresh)!.status).toBe("running");
  });

  it("does not touch runs that already finished", () => {
    const done = insert({
      kind: "digest",
      status: "ok",
      startedMinutesAgo: 500,
      finishedMinutesAgo: 495,
    });

    expect(reconcileStaleRuns(30)).toBe(0);
    expect(getRun(done)!.status).toBe("ok");
  });
});

describe("activeRun", () => {
  it("finds the run in flight", () => {
    const id = startRun({ stages: ["ingest"], week: "2026-W37", trigger: "ui" });

    expect(activeRun()?.id).toBe(id);
  });

  it("reports nothing once the stale one has been reconciled", () => {
    insert({ kind: "ingest", status: "running", startedMinutesAgo: 45 });

    expect(activeRun()).toBeUndefined();
  });
});

describe("listRuns", () => {
  beforeEach(() => {
    insert({ kind: "ingest+curate+digest+posts", status: "error", week: "2026-W37" });
    insert({ kind: "curate", status: "ok", week: "2026-W36" });
    insert({ kind: "posts", status: "ok", week: "2026-W36" });
  });

  it("returns the most recent first", () => {
    expect(listRuns().map((r) => r.kind)).toEqual([
      "posts",
      "curate",
      "ingest+curate+digest+posts",
    ]);
  });

  it("filters by status", () => {
    expect(listRuns({ status: "ok" })).toHaveLength(2);
  });

  it("filters by week", () => {
    expect(listRuns({ week: "2026-W37" }).map((r) => r.kind)).toEqual([
      "ingest+curate+digest+posts",
    ]);
  });

  it("matches a stage inside a multi-stage run, not just a run of that stage alone", () => {
    expect(listRuns({ kind: "curate" }).map((r) => r.kind)).toEqual([
      "curate",
      "ingest+curate+digest+posts",
    ]);
  });

  it("does not match a stage that only appears as part of another name", () => {
    insert({ kind: "digest", status: "ok" });

    expect(listRuns({ kind: "diges" })).toHaveLength(0);
  });

  it("combines filters", () => {
    expect(listRuns({ status: "ok", week: "2026-W36", kind: "posts" })).toHaveLength(1);
  });

  it("counts the duration of a finished run and leaves an open one null", () => {
    getDb().exec("DELETE FROM runs");
    const finished = insert({
      kind: "curate",
      status: "ok",
      startedMinutesAgo: 10,
      finishedMinutesAgo: 8,
    });
    const open = insert({ kind: "posts", status: "running" });

    expect(getRun(finished)!.seconds).toBe(120);
    expect(getRun(open)!.seconds).toBeNull();
  });
});

describe("runStages", () => {
  it("reads the stages back out of the record", () => {
    expect(runStages({ kind: "ingest+curate" })).toEqual(["ingest", "curate"]);
  });

  it("survives an empty kind", () => {
    expect(runStages({ kind: "" })).toEqual([]);
  });
});

describe("runStats", () => {
  it("parses what the pipeline recorded", () => {
    expect(runStats({ stats: '{"week":"2026-W37"}' })).toEqual({ week: "2026-W37" });
  });

  it("gives an empty object for a run that recorded nothing or wrote nonsense", () => {
    expect(runStats({ stats: null })).toEqual({});
    expect(runStats({ stats: "not json" })).toEqual({});
  });
});

describe("runWeeks", () => {
  it("lists the distinct weeks, most recent first", () => {
    insert({ kind: "curate", status: "ok", week: "2026-W36" });
    insert({ kind: "digest", status: "ok", week: "2026-W36" });
    insert({ kind: "posts", status: "ok", week: "2026-W37" });

    expect(runWeeks()).toEqual(["2026-W37", "2026-W36"]);
  });
});
