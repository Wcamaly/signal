import { getDb } from "../db";
import { generalItemCount } from "../digest-defs";
import { fillSelectedImages } from "../images";
import { chatJson, isJsonTruncated, llmReady, modelLabel } from "../llm";
import { getPrompt, renderPrompt } from "../prompts";
import type { Item, VoiceProfile } from "../types";
import { voiceVars } from "./shared";

/** Items scored per model call; see curateWeek. */
export const CURATOR_BATCH = 30;

type Verdict = {
  id: number;
  score: number;
  why: string;
  angle: string;
  topics: string[];
  cluster: string;
};

/** Used when no model is configured, so the pipeline still produces something. */
function heuristicScore(item: Item, voice: VoiceProfile): Verdict {
  const text = `${item.title} ${item.summary ?? ""}`.toLowerCase();
  const strong = ["regulation", "ai act", "on-premise", "audit", "compliance", "agent", "agentic", "governance", "privacy", "sovereign", "eval", "reliability", "incident", "hallucination", "cost"];
  const weak = ["funding", "raises", "partnership", "hiring", "announces availability"];
  let score = 45;
  for (const k of strong) if (text.includes(k)) score += 8;
  for (const k of weak) if (text.includes(k)) score -= 12;
  score = Math.max(5, Math.min(96, score));
  return {
    id: item.id,
    score,
    why: "Heuristic score: no LLM configured yet. Add a provider under Model for the real analysis.",
    angle: voice.pillars[0] ? `Tentative angle around ${voice.pillars[0].toLowerCase()}.` : "Tentative angle.",
    topics: [],
    cluster: item.title.split(/[:—-]/)[0].trim().slice(0, 60),
  };
}

/**
 * Scores the week's items that have no score yet — never re-scores, so a daily
 * run costs one pass over that day's new items — then re-marks the week's
 * top N as selected, N being the general definition's item count (the same
 * number as the `signals_per_week` setting).
 */
export async function curateWeek(week: string, voice: VoiceProfile) {
  const db = getDb();
  const items = db
    .prepare("SELECT * FROM items WHERE week_key = ? AND status = 'new' ORDER BY published_at DESC LIMIT 120")
    .all(week) as Item[];

  if (!items.length) return { scored: 0, selected: 0, images: 0, model: modelLabel() };

  const update = db.prepare(
    `UPDATE items SET score = @score, why = @why, angle = @angle, topics = @topics, cluster = @cluster, status = 'scored' WHERE id = @id`,
  );
  const save = db.transaction((vs: Verdict[]) => {
    for (const v of vs) {
      if (typeof v?.id !== "number") continue;
      update.run({
        id: v.id,
        score: Number(v.score) || 0,
        why: v.why ?? null,
        angle: v.angle ?? null,
        topics: JSON.stringify(v.topics ?? []),
        cluster: v.cluster ?? null,
      });
    }
  });

  let scored = 0;
  if (!llmReady()) {
    const verdicts = items.map((i) => heuristicScore(i, voice));
    save(verdicts);
    scored = verdicts.length;
  } else {
    // In batches: a verdict is ~150 tokens, so 120 items in one answer outgrow
    // any sensible Max tokens and the JSON comes back cut. Each batch is saved
    // as it lands, so a failure halfway keeps what was already scored.
    // Adaptive thinking (Claude Opus 5) also spends max_tokens on hidden
    // reasoning, so a batch that looked safe still arrives cut — split it
    // and retry rather than failing the whole run.
    const prompt = getPrompt("curator");
    const scoreBatch = async (batch: Item[]): Promise<Verdict[]> => {
      const payload = batch.map((it) => ({
        id: it.id,
        title: it.title,
        source: it.source_id,
        published: it.published_at,
        summary: (it.summary ?? "").slice(0, 500),
      }));
      try {
        return await chatJson<Verdict[]>({
          system: prompt.system,
          prompt: renderPrompt(prompt.template, {
            ...voiceVars(voice, week),
            items: JSON.stringify(payload, null, 1),
          }),
          temperature: 0.3,
        });
      } catch (err) {
        if (!isJsonTruncated(err) || batch.length < 2) throw err;
        const mid = Math.ceil(batch.length / 2);
        return [...(await scoreBatch(batch.slice(0, mid))), ...(await scoreBatch(batch.slice(mid)))];
      }
    };
    for (let i = 0; i < items.length; i += CURATOR_BATCH) {
      const verdicts = await scoreBatch(items.slice(i, i + CURATOR_BATCH));
      save(verdicts);
      scored += verdicts.length;
    }
  }

  // Selection: best item per cluster, top N of the week (N = general.item_count). It runs every day now,
  // so it must not undo the radar: a rejected item is never picked, and one
  // already written about stays `used` (it still counts towards the N).
  const limit = generalItemCount();
  db.prepare("UPDATE items SET status = 'scored' WHERE week_key = ? AND status = 'selected'").run(week);
  const top = db
    .prepare(
      `SELECT id FROM items WHERE week_key = ? AND score IS NOT NULL AND status != 'rejected'
       GROUP BY COALESCE(cluster, title) HAVING score = MAX(score)
       ORDER BY score DESC LIMIT ?`,
    )
    .all(week, limit) as { id: number }[];
  const sel = db.prepare("UPDATE items SET status = 'selected' WHERE id = ? AND status = 'scored'");
  db.transaction(() => top.forEach((t) => sel.run(t.id)))();

  // Last, over the ten or so items that were actually selected.
  const images = await fillSelectedImages(week);

  return { scored, selected: top.length, images, model: modelLabel() };
}
