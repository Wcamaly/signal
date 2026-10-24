import { categoryLabel, getCategories } from "../categories";
import { getDb } from "../db";
import { chatJson, llmReady, modelLabel } from "../llm";
import { periodRange, type PeriodKey } from "../periods";
import { getPrompt, renderPrompt } from "../prompts";
import type { DigestDef, Item, VoiceProfile } from "../types";
import { isWeekKey } from "../weeks";
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
 * One row per definition and period. Running a stage again rewrites the row in
 * place, so posts keep their digest_id. `week_key` is filled for weekly
 * periods and `category` keeps its legacy meaning ('' = general) for old
 * readers. Returns the id.
 */
export function saveDigest(
  defKey: string,
  periodKey: string,
  result: DigestText,
  items: Pick<Item, "id">[],
  language: string,
): number {
  const db = getDb();
  db.prepare(
    `INSERT INTO digests (def_key, period_key, week_key, category, title, subtitle, markdown, item_ids, model, status, language)
     VALUES (@def_key, @period_key, @week_key, @category, @title, @subtitle, @markdown, @item_ids, @model, 'draft', @language)
     ON CONFLICT(def_key, period_key) DO UPDATE SET
       title = excluded.title, subtitle = excluded.subtitle, markdown = excluded.markdown,
       item_ids = excluded.item_ids, model = excluded.model, language = excluded.language,
       created_at = datetime('now')`,
  ).run({
    def_key: defKey,
    period_key: periodKey,
    week_key: isWeekKey(periodKey) ? periodKey : null,
    category: defKey === "general" ? "" : defKey,
    title: result.title,
    subtitle: result.subtitle,
    markdown: result.markdown,
    item_ids: JSON.stringify(items.map((i) => i.id)),
    model: modelLabel(),
    language,
  });
  const row = db.prepare("SELECT id FROM digests WHERE def_key = ? AND period_key = ?").get(defKey, periodKey) as {
    id: number;
  };
  return row.id;
}

/**
 * The items that feed an item digest: scored, not rejected on the radar, in
 * the period (a weekly period by `week_key`, which is indexed; a day or a month
 * by `published_at`), from the definition's categories (all when empty). The
 * curator's picks and the items already written about go first, then the rest
 * by score, up to `item_count`.
 */
export function digestItems(def: Pick<DigestDef, "categories" | "item_count">, period: PeriodKey): Item[] {
  const where = ["i.score IS NOT NULL", "i.status != 'rejected'"];
  const params: unknown[] = [];
  if (isWeekKey(period)) {
    where.push("i.week_key = ?");
    params.push(period);
  } else {
    const { start, end } = periodRange(period);
    // published_at is stored as toISOString(), so the bounds are compared the same way.
    where.push("i.published_at >= ? AND i.published_at < ?");
    params.push(start.toISOString(), end.toISOString());
  }
  if (def.categories.length) {
    where.push(`s.category IN (${def.categories.map(() => "?").join(", ")})`);
    params.push(...def.categories);
  }
  return getDb()
    .prepare(
      `SELECT i.* FROM items i LEFT JOIN sources s ON s.id = i.source_id
       WHERE ${where.join(" AND ")}
       ORDER BY CASE WHEN i.status IN ('selected', 'used') THEN 0 ELSE 1 END, i.score DESC, i.id
       LIMIT ?`,
    )
    .all(...params, def.item_count) as Item[];
}

/**
 * Writes the digest of one definition for one period. The prompt follows the
 * shape: no categories → `digest`; some categories → `category_digest`, with
 * `{{category}}` the labels joined. A period with nothing scored is skipped,
 * not an error.
 */
export async function buildDigestFor(
  def: DigestDef,
  period: PeriodKey,
  voice: VoiceProfile,
): Promise<{ digestId: number; items: number } | { skipped: true }> {
  if (def.kind !== "items") throw new Error(`"${def.label}" is a roll-up: roll-ups are not available yet.`);
  const items = digestItems(def, period);
  if (!items.length) return { skipped: true };

  const categories = getCategories();
  const scope = def.categories.map((key) => categoryLabel(categories, key).label).join(", ");
  let result: DigestText;

  if (!llmReady()) {
    result = scope
      ? {
          title: `${def.label} — ${period}`,
          subtitle: "Demo mode: no LLM configured, so the best items of these categories are listed without analysis.",
          markdown: `This digest was produced without a model. Configure a provider under **Model** and run the pipeline again to get the real write-up.\n\n## The signals\n\n${demoLines(items)}`,
        }
      : {
          title: `AI radar — ${period}`,
          subtitle: "Demo mode: no LLM configured, so the selected items are listed without analysis.",
          markdown: `This digest was produced without a model. Configure a provider under **Model** and run the pipeline again to get the real write-up.\n\n## The signals\n\n${demoLines(items)}\n\n## Noise of the week\n\n_(needs a model)_\n\n## What I would say\n\n_(needs a model)_`,
        };
  } else {
    const prompt = getPrompt(scope ? "category_digest" : "digest");
    result = await chatJson({
      system: prompt.system,
      prompt: renderPrompt(prompt.template, {
        ...voiceVars(voice, period),
        ...(scope ? { category: scope } : {}),
        signals: JSON.stringify(signalPayload(items), null, 1),
      }),
      temperature: 0.7,
    });
  }

  return { digestId: saveDigest(def.key, period, result, items, voice.language), items: items.length };
}
