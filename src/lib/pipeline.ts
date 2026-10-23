import { getChannels } from "./channels";
import { getDb, getSetting } from "./db";
import { ingestAll } from "./ingest";
import { curateWeek } from "./agents/curator";
import { buildDigestFor } from "./agents/digest";
import { getDigestDefs } from "./digest-defs";
import { writePosts } from "./agents/writer";
import { llmStatus } from "./llm";
import { finishRun, startRun, type RunTrigger } from "./runs";
import { DEFAULT_VOICE, type Channel, type VoiceProfile } from "./types";
import { resolveWeek, type WeekKey } from "./weeks";

export function getVoice(): VoiceProfile {
  return { ...DEFAULT_VOICE, ...getSetting<Partial<VoiceProfile>>("voice", {}) };
}

export type Stage = "ingest" | "curate" | "digest" | "posts";

export const STAGES: { key: Stage; label: string }[] = [
  { key: "ingest", label: "Ingest sources" },
  { key: "curate", label: "Curate" },
  { key: "digest", label: "Weekly digest" },
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
   * `current`, `previous` or an ISO week. Ingest ignores it — an item is filed
   * under the week it was published in — but curation, the digest and the posts
   * all work on this one week.
   */
  week?: string;
  trigger?: RunTrigger;
};

export type PipelineResult = {
  ok: boolean;
  runId: number | null;
  week: WeekKey | null;
  log: string[];
  stats: Record<string, unknown>;
  error?: string;
};

export type PostGroup = { digestId: number; defKey: string; channels: Channel[] };

/**
 * The posts stage, planned: one group per digest the channels write from.
 * A channel bound to a definition with no digest this week is skipped with a
 * warning; the general digest missing is still an error, as it always was.
 */
export function groupChannelsByDigest(
  week: string,
  channels: Channel[],
): { groups: PostGroup[]; skipped: string[] } {
  const byDef = new Map<string, Channel[]>();
  for (const c of channels) {
    const key = c.digest_def ?? "general";
    byDef.set(key, [...(byDef.get(key) ?? []), c]);
  }

  const find = getDb().prepare("SELECT id FROM digests WHERE def_key = ? AND period_key = ?");
  const groups: PostGroup[] = [];
  const skipped: string[] = [];
  for (const [defKey, list] of byDef) {
    const row = find.get(defKey, week) as { id: number } | undefined;
    if (row) groups.push({ digestId: row.id, defKey, channels: list });
    else if (defKey === "general") throw new Error(`There is no digest for ${week} yet.`);
    else skipped.push(`Channels ${list.map((c) => c.label).join(", ")} skipped: no "${defKey}" digest for ${week}.`);
  }
  return { groups, skipped };
}

export async function runPipeline(
  stages: Stage[] = ALL_STAGES,
  options: RunOptions = {},
): Promise<PipelineResult> {
  const voice = getVoice();
  const log: string[] = [];

  // Resolving the week and claiming the slot both happen before there is a run
  // to record the failure in, so they report back the same shape as any other
  // failure rather than throwing at the caller.
  let week: WeekKey;
  let runId: number;
  try {
    week = resolveWeek(options.week);
    runId = startRun({ stages, week, trigger: options.trigger ?? "ui" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, runId: null, week: null, log: [`✖ ${msg}`], stats: {}, error: msg };
  }

  const stats: Record<string, unknown> = { week };

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
      const r = await curateWeek(week, voice);
      stats.curate = r;
      log.push(`Curation: ${r.scored} scored, ${r.selected} selected, ${r.images} images found.`);
    }
    if (stages.includes("digest")) {
      // Every enabled weekly definition, for the run's week. One failing or
      // empty definition is a warning, not a failed run.
      const digests: Record<string, unknown>[] = [];
      for (const def of getDigestDefs(true).filter((d) => d.kind === "items" && d.cadence === "weekly")) {
        try {
          const r = await buildDigestFor(def, week, voice);
          digests.push({ def: def.key, period: week, ...r });
          log.push(
            "skipped" in r
              ? `⚠ Digest "${def.label}" ${week} skipped: no scored items.`
              : `Digest "${def.label}" ${week}: ${r.items} signals.`,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          digests.push({ def: def.key, period: week, error: msg });
          log.push(`⚠ Digest "${def.label}" ${week} failed: ${msg}`);
        }
      }
      stats.digests = digests;
    }
    if (stages.includes("posts")) {
      const channels = getChannels(true).filter((c) => c.posts_per_run > 0);
      if (!channels.length) throw new Error("No channel is enabled. Enable one under Channels.");
      const plan = groupChannelsByDigest(week, channels);
      plan.skipped.forEach((s) => log.push(`⚠ ${s}`));
      let created = 0;
      let written = 0;
      for (const g of plan.groups) {
        const r = await writePosts(g.digestId, voice, g.channels);
        created += r.created;
        written += r.channels;
      }
      stats.posts = { created, channels: written };
      log.push(`Writing: ${created} drafts across ${written} channels.`);
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
