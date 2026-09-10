import { getChannels } from "./channels";
import { getDb, getSetting } from "./db";
import { ingestAll } from "./ingest";
import { curateWeek } from "./agents/curator";
import { buildDigest } from "./agents/digest";
import { writePosts } from "./agents/writer";
import { llmStatus } from "./llm";
import { finishRun, startRun, type RunTrigger } from "./runs";
import { DEFAULT_VOICE, type VoiceProfile } from "./types";
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

export async function runPipeline(
  stages: Stage[] = ALL_STAGES,
  options: RunOptions = {},
): Promise<PipelineResult> {
  const db = getDb();
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
    let digestId: number | undefined;
    if (stages.includes("digest")) {
      const r = await buildDigest(week, voice);
      digestId = r.digestId;
      stats.digest = r;
      log.push(`Weekly digest written from ${r.items} signals.`);
    }
    if (stages.includes("posts")) {
      if (!digestId) {
        const d = db.prepare("SELECT id FROM digests WHERE week_key = ?").get(week) as { id: number } | undefined;
        if (!d) throw new Error(`There is no digest for ${week} yet.`);
        digestId = d.id;
      }
      const channels = getChannels(true).filter((c) => c.posts_per_run > 0);
      if (!channels.length) throw new Error("No channel is enabled. Enable one under Channels.");
      const r = await writePosts(digestId, voice, channels);
      stats.posts = r;
      log.push(`Writing: ${r.created} drafts across ${r.channels} channels.`);
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
