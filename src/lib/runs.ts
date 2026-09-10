import { getDb, parseJson } from "./db";
import type { Stage } from "./pipeline";
import type { WeekKey } from "./weeks";

/**
 * The record of every pipeline execution: what was asked for, on which week, who
 * asked, and what came out. `pipeline.ts` writes through this module and never
 * touches the table itself, so the rules about what may run — one at a time, and
 * never a row left running forever — hold wherever a run is started from.
 */

/** `interrupted` is not a result: it is a run whose process disappeared. */
export type RunStatus = "running" | "ok" | "error" | "interrupted";

export type RunTrigger = "ui" | "cron" | "api";

export type Run = {
  id: number;
  kind: string;
  status: RunStatus;
  week_key: WeekKey | null;
  trigger: RunTrigger | null;
  stats: string | null;
  log: string | null;
  started_at: string;
  finished_at: string | null;
};

/**
 * Past this, a run still marked `running` is a run whose process died: nothing
 * in the pipeline takes half an hour, and the CronJob itself gives up at twenty
 * minutes (`activeDeadlineSeconds` in deploy/kubernetes/cronjob.yaml).
 */
export const STALE_AFTER_MINUTES = 30;

/**
 * Closes the runs left behind by a process that died — a pod eviction, a deploy
 * in the middle of a run, a browser tab closed while the stage was working.
 * Without this the concurrency guard below would block every later run.
 */
export function reconcileStaleRuns(maxMinutes: number = STALE_AFTER_MINUTES): number {
  const res = getDb()
    .prepare(
      `UPDATE runs
          SET status = 'interrupted',
              finished_at = datetime('now'),
              log = COALESCE(log || char(10), '') || ?
        WHERE status = 'running'
          AND started_at <= datetime('now', ?)`,
    )
    .run(
      `✖ Interrupted: no result after ${maxMinutes} minutes.`,
      `-${Math.max(1, Math.round(maxMinutes))} minutes`,
    );
  return res.changes;
}

/** The run in flight, if there is one. Stale rows are closed first. */
export function activeRun(): Run | undefined {
  reconcileStaleRuns();
  return getDb().prepare("SELECT * FROM runs WHERE status = 'running' ORDER BY id DESC LIMIT 1").get() as
    | Run
    | undefined;
}

/**
 * Opens a run. Refuses when another one is in flight: the stages write to the
 * same week of the same SQLite file, so two pipelines at once — the schedule
 * firing while someone presses the button — corrupt each other's work.
 */
export function startRun(input: { stages: Stage[]; week: WeekKey; trigger: RunTrigger }): number {
  const active = activeRun();
  if (active) {
    throw new Error(
      `Run #${active.id} (${active.kind}) is already in flight since ${active.started_at} UTC. Wait for it to finish.`,
    );
  }
  const res = getDb()
    .prepare(
      "INSERT INTO runs (kind, status, week_key, trigger) VALUES (?, 'running', ?, ?)",
    )
    .run(input.stages.join("+"), input.week, input.trigger);
  return Number(res.lastInsertRowid);
}

export function finishRun(
  id: number,
  outcome: { status: Exclude<RunStatus, "running">; stats: unknown; log: string[] },
) {
  getDb()
    .prepare(
      "UPDATE runs SET status = ?, stats = ?, log = ?, finished_at = datetime('now') WHERE id = ?",
    )
    .run(outcome.status, JSON.stringify(outcome.stats), outcome.log.join("\n"), id);
}

/* ---------- read model ---------- */

export type RunFilter = { status?: string; kind?: string; week?: string };

function where(filter: RunFilter): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    clauses.push("status = ?");
    params.push(filter.status);
  }
  // `kind` holds the stages joined by +, so filtering by one stage is a match
  // inside the string: a "curate" filter has to find "ingest+curate+digest".
  if (filter.kind) {
    clauses.push("('+' || kind || '+') LIKE ?");
    params.push(`%+${filter.kind}+%`);
  }
  if (filter.week) {
    clauses.push("week_key = ?");
    params.push(filter.week);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

export type RunSummary = Run & { seconds: number | null };

const DURATION = "CAST(strftime('%s', finished_at) - strftime('%s', started_at) AS INTEGER)";

export function listRuns(filter: RunFilter = {}, limit = 50, offset = 0): RunSummary[] {
  const { sql, params } = where(filter);
  reconcileStaleRuns();
  return getDb()
    .prepare(
      `SELECT *, CASE WHEN finished_at IS NULL THEN NULL ELSE ${DURATION} END AS seconds
         FROM runs ${sql} ORDER BY id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as RunSummary[];
}

export function countRuns(filter: RunFilter = {}): number {
  const { sql, params } = where(filter);
  return (getDb().prepare(`SELECT COUNT(*) c FROM runs ${sql}`).get(...params) as { c: number }).c;
}

export function getRun(id: number): RunSummary | undefined {
  reconcileStaleRuns();
  return getDb()
    .prepare(
      `SELECT *, CASE WHEN finished_at IS NULL THEN NULL ELSE ${DURATION} END AS seconds
         FROM runs WHERE id = ?`,
    )
    .get(id) as RunSummary | undefined;
}

/** The stages a run was asked for, back as a list. */
export function runStages(run: Pick<Run, "kind">): Stage[] {
  return run.kind.split("+").filter(Boolean) as Stage[];
}

export function runStats(run: Pick<Run, "stats">): Record<string, unknown> {
  return parseJson<Record<string, unknown>>(run.stats, {});
}

/** Distinct kinds already recorded, for the filter bar. */
export function runWeeks(limit = 12): string[] {
  return (
    getDb()
      .prepare(
        "SELECT DISTINCT week_key FROM runs WHERE week_key IS NOT NULL ORDER BY week_key DESC LIMIT ?",
      )
      .all(limit) as { week_key: string }[]
  ).map((r) => r.week_key);
}
