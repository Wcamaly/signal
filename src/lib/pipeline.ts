import { getDb, getSetting, weekKey } from "./db";
import { ingestAll } from "./ingest";
import { curateWeek } from "./agents/curator";
import { buildDigest } from "./agents/digest";
import { writePosts } from "./agents/writer";
import { DEFAULT_VOICE, PLATFORMS, type Platform, type VoiceProfile } from "./types";

export function getVoice(): VoiceProfile {
  return { ...DEFAULT_VOICE, ...getSetting<Partial<VoiceProfile>>("voice", {}) };
}

export type Stage = "ingest" | "curate" | "digest" | "posts";

export async function runPipeline(stages: Stage[] = ["ingest", "curate", "digest", "posts"]) {
  const db = getDb();
  const week = weekKey();
  const voice = getVoice();
  const platforms = getSetting<Platform[]>("platforms", PLATFORMS);
  const perPlatform = getSetting<number>("posts_per_platform", 2);

  const run = db.prepare("INSERT INTO runs (kind, status) VALUES (?, 'running')").run(stages.join("+"));
  const runId = Number(run.lastInsertRowid);
  const log: string[] = [];
  const stats: Record<string, unknown> = { week };

  try {
    if (stages.includes("ingest")) {
      const r = await ingestAll();
      stats.ingest = r;
      log.push(`Ingesta: ${r.inserted} nuevos de ${r.found} items en ${r.sources} fuentes.`);
      r.errors.forEach((e) => log.push(`⚠ ${e}`));
    }
    if (stages.includes("curate")) {
      const r = await curateWeek(week, voice);
      stats.curate = r;
      log.push(`Curaduría: ${r.scored} evaluados, ${r.selected} seleccionados.`);
    }
    let digestId: number | undefined;
    if (stages.includes("digest")) {
      const r = await buildDigest(week, voice);
      digestId = r.digestId;
      stats.digest = r;
      log.push(`Resumen semanal generado sobre ${r.items} señales.`);
    }
    if (stages.includes("posts")) {
      if (!digestId) {
        const d = db.prepare("SELECT id FROM digests WHERE week_key = ?").get(week) as { id: number } | undefined;
        if (!d) throw new Error("No hay resumen para esta semana todavía.");
        digestId = d.id;
      }
      const r = await writePosts(digestId, voice, platforms, perPlatform);
      stats.posts = r;
      log.push(`Redacción: ${r.created} borradores creados.`);
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
