import { getDb } from "../db";
import { chatJson, llmReady, modelLabel } from "../llm";
import { getPrompt, renderPrompt } from "../prompts";
import type { Category, Item, VoiceProfile } from "../types";
import { voiceVars } from "./shared";

type DigestText = { title: string; subtitle: string; markdown: string };

function signalPayload(items: Item[]) {
  return items.map((i) => ({
    title: i.title,
    url: i.url,
    published: i.published_at,
    score: i.score,
    why: i.why,
    angle: i.angle,
    summary: (i.summary ?? "").slice(0, 900),
  }));
}

function demoLines(items: Item[]) {
  return items
    .map(
      (i) =>
        `### ${i.title}\n\n${(i.summary ?? "").slice(0, 300)}\n\n**Angle to publish:** ${i.angle ?? "—"}\n\n[Source](${i.url})`,
    )
    .join("\n\n");
}

/**
 * One row per week and category ('' = the general digest). Running a stage
 * again rewrites the row in place, so posts keep their digest_id. Returns the id.
 */
export function saveDigest(week: string, category: string, result: DigestText, items: Pick<Item, "id">[], language: string): number {
  const db = getDb();
  db.prepare(
    `INSERT INTO digests (week_key, category, title, subtitle, markdown, item_ids, model, status, language)
     VALUES (@week, @category, @title, @subtitle, @markdown, @item_ids, @model, 'draft', @language)
     ON CONFLICT(week_key, category) DO UPDATE SET
       title = excluded.title, subtitle = excluded.subtitle, markdown = excluded.markdown,
       item_ids = excluded.item_ids, model = excluded.model, language = excluded.language,
       created_at = datetime('now')`,
  ).run({
    week,
    category,
    title: result.title,
    subtitle: result.subtitle,
    markdown: result.markdown,
    item_ids: JSON.stringify(items.map((i) => i.id)),
    model: modelLabel(),
    language,
  });
  const row = db.prepare("SELECT id FROM digests WHERE week_key = ? AND category = ?").get(week, category) as {
    id: number;
  };
  return row.id;
}

export async function buildDigest(week: string, voice: VoiceProfile) {
  const items = getDb()
    .prepare("SELECT * FROM items WHERE week_key = ? AND status = 'selected' ORDER BY score DESC")
    .all(week) as Item[];

  if (!items.length) {
    throw new Error(`No selected items for ${week}. Run ingest + curate first.`);
  }

  let result: DigestText;

  if (!llmReady()) {
    result = {
      title: `AI radar — ${week}`,
      subtitle: "Demo mode: no LLM configured, so the selected items are listed without analysis.",
      markdown: `This digest was produced without a model. Configure a provider under **Model & keys** and run the pipeline again to get the real write-up.\n\n## The signals\n\n${demoLines(items)}\n\n## Noise of the week\n\n_(needs a model)_\n\n## What I would say\n\n_(needs a model)_`,
    };
  } else {
    const prompt = getPrompt("digest");
    result = await chatJson({
      system: prompt.system,
      prompt: renderPrompt(prompt.template, {
        ...voiceVars(voice, week),
        signals: JSON.stringify(signalPayload(items), null, 1),
      }),
      maxTokens: 16000,
      temperature: 0.7,
    });
  }

  return { digestId: saveDigest(week, "", result, items, voice.language), items: items.length };
}

/** The best-scored items of one category in a week, selected for the general digest or not. */
export function categoryDigestItems(week: string, category: string, limit: number): Item[] {
  return getDb()
    .prepare(
      `SELECT i.* FROM items i JOIN sources s ON s.id = i.source_id
       WHERE i.week_key = ? AND s.category = ? AND i.score IS NOT NULL
       ORDER BY i.score DESC, i.id LIMIT ?`,
    )
    .all(week, category, limit) as Item[];
}

/** A category with nothing scored this week is skipped, not an error. */
export async function buildCategoryDigest(
  week: string,
  category: Category,
  voice: VoiceProfile,
): Promise<{ digestId: number; items: number } | { skipped: true }> {
  const items = categoryDigestItems(week, category.key, category.digest_items);
  if (!items.length) return { skipped: true };

  let result: DigestText;

  if (!llmReady()) {
    result = {
      title: `${category.label} — ${week}`,
      subtitle: "Demo mode: no LLM configured, so the category's best items are listed without analysis.",
      markdown: `This digest was produced without a model. Configure a provider under **Model & keys** and run the pipeline again to get the real write-up.\n\n## The signals\n\n${demoLines(items)}`,
    };
  } else {
    const prompt = getPrompt("category_digest");
    result = await chatJson({
      system: prompt.system,
      prompt: renderPrompt(prompt.template, {
        ...voiceVars(voice, week),
        category: category.label,
        signals: JSON.stringify(signalPayload(items), null, 1),
      }),
      maxTokens: 16000,
      temperature: 0.7,
    });
  }

  return { digestId: saveDigest(week, category.key, result, items, voice.language), items: items.length };
}
