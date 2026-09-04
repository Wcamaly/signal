import { getDb } from "../db";
import { getChannel } from "../channels";
import { resolveLanguage } from "../languages";
import { chatJson, llmReady, modelLabel } from "../llm";
import { getPrompt, renderPrompt } from "../prompts";
import type { Channel, Item, VoiceProfile } from "../types";
import { voiceVars } from "./shared";

type Draft = {
  angle: string;
  hook: string;
  body: string;
  hashtags: string[];
  visual_brief?: string;
  item_index?: number;
  /** Optional: a customised writer prompt will not return these. */
  link?: string;
  image_alt?: string;
  use_source_image?: boolean;
};

function demoDraft(item: Item): Draft {
  const base = `[Demo mode — no LLM configured]\n\n${item.title}\n\n${(item.summary ?? "").slice(0, 240)}\n\nDetected angle: ${item.angle ?? "—"}\n\nSource: ${item.url}`;
  return {
    angle: item.angle ?? item.title,
    hook: item.title.slice(0, 90),
    body: base,
    hashtags: ["#AI"],
  };
}

export async function writePosts(digestId: number, voice: VoiceProfile, channels: Channel[]) {
  const db = getDb();
  const digest = db.prepare("SELECT * FROM digests WHERE id = ?").get(digestId) as
    | { id: number; week_key: string; title: string; markdown: string; item_ids: string }
    | undefined;
  if (!digest) throw new Error("Digest not found");

  const ids = JSON.parse(digest.item_ids || "[]") as number[];
  const items = ids.length
    ? (db
        .prepare(`SELECT * FROM items WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY score DESC`)
        .all(...ids) as Item[])
    : [];

  const prompt = getPrompt("writer");
  const created: number[] = [];
  const insert = db.prepare(
    `INSERT INTO posts (digest_id, item_id, platform, angle, hook, body, hashtags, visual_brief, char_count, model, status, language, link, image_url, image_alt)
     VALUES (@digest_id, @item_id, @platform, @angle, @hook, @body, @hashtags, @visual_brief, @char_count, @model, 'draft', @language, @link, @image_url, @image_alt)`,
  );

  for (const channel of channels) {
    // The channel's language wins over the working language of the profile.
    // The prompt variable keeps its name — a user who has customised the writer
    // prompt has `{{language}}` in it and overrides are never migrated.
    const language = resolveLanguage(channel.language, voice.language);
    const count = Math.max(1, channel.posts_per_run);
    let drafts: Draft[];

    if (!llmReady()) {
      // Carry the index, or the draft has no item and so no link and no image.
      drafts = items.slice(0, count).map((item, index) => ({ ...demoDraft(item), item_index: index }));
    } else {
      drafts = await chatJson<Draft[]>({
        system: prompt.system,
        prompt: renderPrompt(prompt.template, {
          ...voiceVars(voice, digest.week_key),
          language,
          channel_label: channel.label,
          channel_hint: channel.hint ?? "",
          channel_limit: String(channel.char_limit),
          count: String(count),
          digest: (digest.markdown ?? "").slice(0, 6000),
          signals: JSON.stringify(
            items.map((i, index) => ({
              index,
              title: i.title,
              url: i.url,
              angle: i.angle,
              why: i.why,
              image: i.image_url,
            })),
            null,
            1,
          ),
        }),
        maxTokens: 8000,
        temperature: 1,
      });
    }

    for (const d of drafts) {
      if (!d?.body) continue;
      const item = typeof d.item_index === "number" ? items[d.item_index] : undefined;
      // Declining the image is allowed; inventing one is not. `undefined` means
      // a customised prompt that does not know the field, and defaults to yes.
      const useImage = d.use_source_image !== false;
      const res = insert.run({
        digest_id: digestId,
        item_id: item?.id ?? null,
        platform: channel.key,
        angle: d.angle ?? null,
        hook: d.hook ?? null,
        body: d.body,
        hashtags: JSON.stringify(d.hashtags ?? []),
        visual_brief: d.visual_brief ?? null,
        char_count: d.body.length,
        model: modelLabel(),
        language,
        link: (typeof d.link === "string" && d.link.trim()) || item?.url || null,
        image_url: useImage ? (item?.image_url ?? null) : null,
        image_alt: useImage ? (d.image_alt?.trim() || null) : null,
      });
      created.push(Number(res.lastInsertRowid));
    }
  }

  db.prepare(
    `UPDATE items SET status = 'used' WHERE id IN (SELECT item_id FROM posts WHERE digest_id = ? AND item_id IS NOT NULL)`,
  ).run(digestId);

  return { created: created.length, channels: channels.length };
}

/** Regenerates a post from an instruction typed in the publications queue. */
export async function refinePost(postId: number, instruction: string, voice: VoiceProfile) {
  const db = getDb();
  const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(postId) as
    | { id: number; platform: string; body: string; angle: string | null }
    | undefined;
  if (!post) throw new Error("Post not found");
  if (!llmReady()) throw new Error("Configure an LLM provider under Model & keys to rewrite posts");

  const channel = getChannel(post.platform);
  const prompt = getPrompt("refine");
  const out = await chatJson<{ hook: string; body: string; hashtags: string[] }>({
    system: prompt.system,
    prompt: renderPrompt(prompt.template, {
      ...voiceVars(voice, ""),
      channel_label: channel?.label ?? post.platform,
      channel_limit: String(channel?.char_limit ?? 3000),
      post: post.body,
      instruction,
    }),
    maxTokens: 4000,
    temperature: 0.9,
  });

  db.prepare(
    "UPDATE posts SET hook = ?, body = ?, hashtags = ?, char_count = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(out.hook, out.body, JSON.stringify(out.hashtags ?? []), out.body.length, postId);

  return out;
}
