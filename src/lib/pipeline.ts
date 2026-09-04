import { getChannels } from "./channels";
import { getDb, getSetting, weekKey } from "./db";
import { ingestAll } from "./ingest";
import { curateWeek } from "./agents/curator";
import { buildDigest } from "./agents/digest";
import { writePosts } from "./agents/writer";
import { llmStatus } from "./llm";
import { DEFAULT_VOICE, type VoiceProfile } from "./types";

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

export async function runPipeline(stages: Stage[] = ["ingest", "curate", "digest", "posts"]) {
  const db = getDb();
  const week = weekKey();
  const voice = getVoice();

  const run = db.prepare("INSERT INTO runs (kind, status) VALUES (?, 'running')").run(stages.join("+"));
  const runId = Number(run.lastInsertRowid);
  const log: string[] = [];
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
        if (!d) throw new Error("There is no digest for this week yet.");
        digestId = d.id;
      }
      const channels = getChannels(true).filter((c) => c.posts_per_run > 0);
      if (!channels.length) throw new Error("No channel is enabled. Enable one under Channels.");
      const r = await writePosts(digestId, voice, channels);
      stats.posts = r;
      log.push(`Writing: ${r.created} drafts across ${r.channels} channels.`);
    }

    db.prepare("UPDATE runs SET status = 'ok', stats = ?, log = ?, finished_at = datetime('now') WHERE id = ?").run(
      JSON.stringify(stats),
      log.join("\n"),
      runId,
    );
    return { ok: true, runId, log, stats };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.push(`✖ ${msg}`);
    db.prepare("UPDATE runs SET status = 'error', stats = ?, log = ?, finished_at = datetime('now') WHERE id = ?").run(
      JSON.stringify(stats),
      log.join("\n"),
      runId,
    );
    return { ok: false, runId, log, stats, error: msg };
  }
}
