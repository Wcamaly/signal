import { getChannels } from "./channels";
import { getDb, getSetting } from "./db";
import { ingestAll } from "./ingest";
import { curateWeek } from "./agents/curator";
import { buildDigestFor } from "./agents/digest";
import { getDigestDefs } from "./digest-defs";
import { writePosts } from "./agents/writer";
import { llmStatus } from "./llm";
import { isDue, periodWeeks, previousPeriod, resolvePeriod, type PeriodKey } from "./periods";
import { finishRun, runStats, startRun, type Run, type RunTrigger } from "./runs";
import { DEFAULT_VOICE, type Channel, type DigestDef, type VoiceProfile } from "./types";
import { previousWeekKey, resolveWeek, weekKey, type WeekKey } from "./weeks";

export function getVoice(): VoiceProfile {
  return { ...DEFAULT_VOICE, ...getSetting<Partial<VoiceProfile>>("voice", {}) };
}

export type Stage = "ingest" | "curate" | "digest" | "posts";

export const STAGES: { key: Stage; label: string }[] = [
  { key: "ingest", label: "Ingest sources" },
  { key: "curate", label: "Curate" },
  { key: "digest", label: "Digests" },
  { key: "posts", label: "Write posts" },
];

export const ALL_STAGES: Stage[] = STAGES.map((s) => s.key);

/** Keeps the canonical order whatever order the caller listed the stages in. */
export function parseStages(raw: string | null | undefined): Stage[] {
  if (!raw?.trim()) return ALL_STAGES;
  const asked = raw.split(",").map((s) => s.trim());
  const unknown = asked.filter((s) => s && !ALL_STAGES.includes(s as Stage));
  if (unknown.length) {
    throw new Error(`Unknown stage "${unknown[0]}". Available: ${ALL_STAGES.join(", ")}.`);
  }
  return ALL_STAGES.filter((s) => asked.includes(s));
}

export type RunOptions = {
  /**
   * Legacy, from before digest definitions: `current`, `previous` or an ISO
   * week. Curates that week only and writes every enabled weekly definition
   * for it — the general digest included, as the old weekly schedule expects.
   */
  week?: string;
  /** Write these definitions instead of what is due. */
  defs?: string[];
  /** `current`, `previous` (the default) or a period key, for `defs`. */
  period?: string;
  /** Exact definition + period pairs. What "Run again" replays. */
  targets?: { def: string; period: string }[];
  /** The clock the due rules read. Tests and manual checks set it. */
  now?: Date;
  trigger?: RunTrigger;
};

export type PipelineResult = {
  ok: boolean;
  runId: number | null;
  week: WeekKey | null;
  log: string[];
  stats: Record<string, unknown>;
  error?: string;
  /**
   * Why no run was opened (`runId` is null): the request itself was wrong
   * (`invalid`), or another run is in flight (`busy`). Absent once a run
   * opened — a run that then fails is a failure, not a refusal.
   */
  refused?: "invalid" | "busy";
};

/** One digest a run works on: a definition and the period it covers. */
export type DigestTarget = { def: DigestDef; period: PeriodKey };

/**
 * What a run at `now` writes when nobody names anything: every enabled item
 * definition whose cadence is due — daily every day, weekly on Monday, monthly
 * on the 1st — each for the period that just closed.
 */
export function dueTargets(defs: DigestDef[], now: Date): DigestTarget[] {
  return defs
    .filter((d) => d.enabled && d.kind === "items" && isDue(d.cadence, now))
    .map((def) => ({ def, period: previousPeriod(def.cadence, now) }));
}

/** The digests a run works on, from its options. Throws on a bad request. */
export function resolveTargets(options: RunOptions, defs: DigestDef[], now: Date): DigestTarget[] {
  const find = (key: string) => {
    const def = defs.find((d) => d.key === key);
    if (!def) throw new Error(`Unknown digest "${key}". Available: ${defs.map((d) => d.key).join(", ")}.`);
    if (def.kind !== "items") throw new Error(`"${def.label}" is a roll-up: roll-ups are not available yet.`);
    return def;
  };
  if (options.targets) {
    return options.targets.map((t) => {
      const def = find(t.def);
      return { def, period: resolvePeriod(def.cadence, t.period, now) };
    });
  }
  if (options.defs?.length) {
    return [...new Set(options.defs)].map((key) => {
      const def = find(key);
      return { def, period: resolvePeriod(def.cadence, options.period, now) };
    });
  }
  if (options.period) throw new Error('"period" needs "defs": it says which period of which digests.');
  if (options.week) {
    const week = resolveWeek(options.week, now);
    return defs
      .filter((d) => d.enabled && d.kind === "items" && d.cadence === "weekly")
      .map((def) => ({ def, period: week }));
  }
  return dueTargets(defs, now);
}

/**
 * The weeks the curate stage scores. The current week every day, and on
 * Monday the one that just closed too, so its last day is scored before the
 * weekly digest is written. A legacy `week` replaces both. Digests asked for
 * by name add the weeks they cover.
 */
export function curateWeeks(options: RunOptions, targets: DigestTarget[], now: Date): WeekKey[] {
  const weeks = options.week
    ? [resolveWeek(options.week, now)]
    : [weekKey(now), ...(now.getDay() === 1 ? [previousWeekKey(now)] : [])];
  if (options.targets || options.defs?.length) {
    for (const t of targets) weeks.push(...periodWeeks(t.period));
  }
  return [...new Set(weeks)];
}

export type PostGroup = { digestId: number; defKey: string; period: PeriodKey; channels: Channel[] };

/**
 * The posts stage, planned: one group per digest of this run that a channel
 * writes from. A channel follows its definition (`digest_def`, NULL = general)
 * and writes only when that definition is one of the run's targets — on any
 * other day it writes nothing, and that is not a warning.
 *
 * `written` holds the digests the digest stage wrote in this same run; a
 * target missing from it was skipped or failed, and its channels are skipped
 * with a warning. When the digest stage did not run (the run dialog runs one
 * stage per call), `written` is null and the stored digest of each target is
 * used instead.
 */
export function groupChannelsByTarget(
  targets: DigestTarget[],
  written: Map<string, number> | null,
  channels: Channel[],
): { groups: PostGroup[]; skipped: string[] } {
  const find = getDb().prepare("SELECT id FROM digests WHERE def_key = ? AND period_key = ?");
  const groups: PostGroup[] = [];
  const skipped: string[] = [];
  for (const { def, period } of targets) {
    const list = channels.filter((c) => (c.digest_def ?? "general") === def.key);
    if (!list.length) continue;
    const id = written
      ? written.get(def.key)
      : (find.get(def.key, period) as { id: number } | undefined)?.id;
    if (id !== undefined) groups.push({ digestId: id, defKey: def.key, period, channels: list });
    else skipped.push(`Channels ${list.map((c) => c.label).join(", ")} skipped: no "${def.label}" digest for ${period}.`);
  }
  return { groups, skipped };
}

/**
 * "Run again": the stages and digests of a past run, interrupted ones
 * included. Every run opened since targets existed records them when it
 * starts; a run without them predates digest definitions and replays as the
 * old weekly run of its week.
 */
export function relaunchOptions(run: Pick<Run, "stats" | "week_key">): RunOptions {
  const targets = runStats(run).targets;
  if (Array.isArray(targets)) return { targets: targets as { def: string; period: string }[] };
  return run.week_key ? { week: run.week_key } : {};
}

export async function runPipeline(
  stages: Stage[] = ALL_STAGES,
  options: RunOptions = {},
): Promise<PipelineResult> {
  const voice = getVoice();
  const log: string[] = [];
  const now = options.now ?? new Date();

  // Resolving what to work on and claiming the slot both happen before there
  // is a run to record the failure in, so they report back the same shape as
  // any other failure rather than throwing at the caller.
  let week: WeekKey;
  let targets: DigestTarget[];
  let weeks: WeekKey[];
  try {
    week = options.week ? resolveWeek(options.week, now) : weekKey(now);
    targets = resolveTargets(options, getDigestDefs(), now);
    weeks = curateWeeks(options, targets, now);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, runId: null, week: null, log: [`✖ ${msg}`], stats: {}, error: msg, refused: "invalid" };
  }

  // `targets` is what "Run again" replays. Written when the run opens, so a
  // run whose process dies half-way still knows what it was working on.
  const stats: Record<string, unknown> = {
    week,
    targets: targets.map((t) => ({ def: t.def.key, period: t.period })),
  };
  let runId: number;
  try {
    runId = startRun({ stages, week, trigger: options.trigger ?? "ui", stats });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, runId: null, week: null, log: [`✖ ${msg}`], stats: {}, error: msg, refused: "busy" };
  }

  const status = llmStatus();
  if (!status.ready && stages.some((s) => s !== "ingest")) {
    log.push(`⚠ ${status.reason} Running in demo mode: the text is filler.`);
  }

  try {
    if (stages.includes("ingest")) {
      const r = await ingestAll();
      stats.ingest = r;
      log.push(`Ingest: ${r.inserted} new out of ${r.found} items across ${r.sources} sources.`);
      r.errors.forEach((e) => log.push(`⚠ ${e}`));
    }
    if (stages.includes("curate")) {
      const curated: Record<string, unknown>[] = [];
      for (const w of weeks) {
        const r = await curateWeek(w, voice);
        curated.push({ week: w, ...r });
        log.push(`Curation ${w}: ${r.scored} scored, ${r.selected} selected, ${r.images} images found.`);
      }
      stats.curate = curated;
    }
    // Keyed by definition: a run has at most one period per definition.
    const written = new Map<string, number>();
    if (stages.includes("digest")) {
      const digests: Record<string, unknown>[] = [];
      if (!targets.length) log.push("No digest is due in this run.");
      for (const { def, period } of targets) {
        try {
          const r = await buildDigestFor(def, period, voice);
          digests.push({ def: def.key, period, ...r });
          if ("skipped" in r) {
            log.push(`⚠ Digest "${def.label}" ${period} skipped: no scored items.`);
          } else {
            written.set(def.key, r.digestId);
            log.push(`Digest "${def.label}" ${period}: ${r.items} signals.`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          digests.push({ def: def.key, period, error: msg });
          log.push(`⚠ Digest "${def.label}" ${period} failed: ${msg}`);
        }
      }
      stats.digests = digests;
      // One failing definition is a warning; all of them failing is a failed run.
      if (digests.length && digests.every((d) => "error" in d)) {
        throw new Error(`Every digest failed. The first one: ${String(digests[0].error)}`);
      }
    }
    if (stages.includes("posts")) {
      const channels = getChannels(true).filter((c) => c.posts_per_run > 0);
      if (!channels.length) throw new Error("No channel is enabled. Enable one under Channels.");
      const plan = groupChannelsByTarget(targets, stages.includes("digest") ? written : null, channels);
      plan.skipped.forEach((s) => log.push(`⚠ ${s}`));
      let created = 0;
      let channelCount = 0;
      for (const g of plan.groups) {
        const r = await writePosts(g.digestId, voice, g.channels);
        created += r.created;
        channelCount += r.channels;
      }
      stats.posts = { created, channels: channelCount };
      log.push(
        plan.groups.length || plan.skipped.length
          ? `Writing: ${created} drafts across ${channelCount} channels.`
          : "Writing: no channel writes from the digests of this run.",
      );
    }

    finishRun(runId, { status: "ok", stats, log });
    return { ok: true, runId, week, log, stats };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.push(`✖ ${msg}`);
    finishRun(runId, { status: "error", stats, log });
    return { ok: false, runId, week, log, stats, error: msg };
  }
}
