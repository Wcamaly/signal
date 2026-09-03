import { getDb } from "../db";
import { chatJson, llmReady, modelLabel } from "../llm";
import { getPrompt, renderPrompt } from "../prompts";
import type { Item, VoiceProfile } from "../types";
import { voiceVars } from "./shared";

export async function buildDigest(week: string, voice: VoiceProfile) {
  const db = getDb();
  const items = db
    .prepare("SELECT * FROM items WHERE week_key = ? AND status = 'selected' ORDER BY score DESC")
    .all(week) as Item[];

  if (!items.length) {
    throw new Error(`No selected items for ${week}. Run ingest + curate first.`);
  }

  let result: { title: string; subtitle: string; markdown: string };

  if (!llmReady()) {
    const lines = items
      .map(
        (i) =>
          `### ${i.title}\n\n${(i.summary ?? "").slice(0, 300)}\n\n**Angle to publish:** ${i.angle ?? "—"}\n\n[Source](${i.url})`,
      )
      .join("\n\n");
    result = {
      title: `AI radar — ${week}`,
      subtitle: "Demo mode: no LLM configured, so the selected items are listed without analysis.",
      markdown: `This digest was produced without a model. Configure a provider under **Model & keys** and run the pipeline again to get the real write-up.\n\n## The signals\n\n${lines}\n\n## Noise of the week\n\n_(needs a model)_\n\n## What I would say\n\n_(needs a model)_`,
    };
  } else {
    const payload = items.map((i) => ({
      title: i.title,
      url: i.url,
      published: i.published_at,
      score: i.score,
      why: i.why,
      angle: i.angle,
      summary: (i.summary ?? "").slice(0, 900),
    }));

    const prompt = getPrompt("digest");
    result = await chatJson({
      system: prompt.system,
      prompt: renderPrompt(prompt.template, {
        ...voiceVars(voice, week),
        signals: JSON.stringify(payload, null, 1),
      }),
      maxTokens: 16000,
      temperature: 0.7,
    });
  }

  db.prepare(
    `INSERT INTO digests (week_key, title, subtitle, markdown, item_ids, model, status)
     VALUES (@week, @title, @subtitle, @markdown, @item_ids, @model, 'draft')
     ON CONFLICT(week_key) DO UPDATE SET
       title = excluded.title, subtitle = excluded.subtitle, markdown = excluded.markdown,
       item_ids = excluded.item_ids, model = excluded.model, created_at = datetime('now')`,
  ).run({
    week,
    title: result.title,
    subtitle: result.subtitle,
    markdown: result.markdown,
    item_ids: JSON.stringify(items.map((i) => i.id)),
    model: modelLabel(),
  });

  const row = db.prepare("SELECT * FROM digests WHERE week_key = ?").get(week) as { id: number };
  return { digestId: row.id, items: items.length };
}
