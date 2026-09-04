import { getDb, getSetting } from "../db";
import { fillSelectedImages } from "../images";
import { chatJson, llmReady, modelLabel } from "../llm";
import { getPrompt, renderPrompt } from "../prompts";
import type { Item, VoiceProfile } from "../types";
import { voiceVars } from "./shared";

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
    why: "Heuristic score: no LLM configured yet. Add a provider under Model & keys for the real analysis.",
    angle: voice.pillars[0] ? `Tentative angle around ${voice.pillars[0].toLowerCase()}.` : "Tentative angle.",
    topics: [],
    cluster: item.title.split(/[:—-]/)[0].trim().slice(0, 60),
  };
}

export async function curateWeek(week: string, voice: VoiceProfile) {
  const db = getDb();
  const items = db
    .prepare("SELECT * FROM items WHERE week_key = ? AND status IN ('new','scored') ORDER BY published_at DESC LIMIT 120")
    .all(week) as Item[];

  if (!items.length) return { scored: 0, selected: 0, images: 0, model: modelLabel() };

  let verdicts: Verdict[];

  if (!llmReady()) {
    verdicts = items.map((i) => heuristicScore(i, voice));
  } else {
    const payload = items.map((i) => ({
      id: i.id,
      title: i.title,
      source: i.source_id,
      published: i.published_at,
      summary: (i.summary ?? "").slice(0, 500),
    }));

    const prompt = getPrompt("curator");
    verdicts = await chatJson<Verdict[]>({
      system: prompt.system,
      prompt: renderPrompt(prompt.template, {
        ...voiceVars(voice, week),
        items: JSON.stringify(payload, null, 1),
      }),
      maxTokens: 16000,
      temperature: 0.3,
    });
  }

  const update = db.prepare(
    `UPDATE items SET score = @score, why = @why, angle = @angle, topics = @topics, cluster = @cluster, status = 'scored' WHERE id = @id`,
  );
  const tx = db.transaction((vs: Verdict[]) => {
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
  tx(verdicts);

  // Selection: best item per cluster, top N of the week.
  const limit = getSetting<number>("signals_per_week", 8);
  db.prepare("UPDATE items SET status = 'scored' WHERE week_key = ? AND status = 'selected'").run(week);
  const top = db
    .prepare(
      `SELECT id FROM items WHERE week_key = ? AND score IS NOT NULL
       GROUP BY COALESCE(cluster, title) HAVING score = MAX(score)
       ORDER BY score DESC LIMIT ?`,
    )
    .all(week, limit) as { id: number }[];
  const sel = db.prepare("UPDATE items SET status = 'selected' WHERE id = ?");
  db.transaction(() => top.forEach((t) => sel.run(t.id)))();

  // Last, over the ten or so items that were actually selected.
  const images = await fillSelectedImages(week);

  return { scored: verdicts.length, selected: top.length, images, model: modelLabel() };
}
