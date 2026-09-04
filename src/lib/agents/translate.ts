import { getDb, parseJson } from "../db";
import { chatJson, llmReady, modelLabel } from "../llm";
import { getPrompt, renderPrompt } from "../prompts";
import type { VoiceProfile } from "../types";
import { voiceVars } from "./shared";

/**
 * One call, one shape: the model receives a JSON object and returns the same
 * keys translated. That is what lets a post and a digest share a prompt.
 * Whatever the model omits falls back to the original value.
 */
async function translateFields<T extends Record<string, unknown>>(
  content: T,
  target: string,
  voice: VoiceProfile,
): Promise<T> {
  if (!llmReady()) {
    throw new Error("Configure an LLM provider under Model & keys to translate");
  }
  const prompt = getPrompt("translate");
  const out = await chatJson<Partial<T>>({
    system: prompt.system,
    prompt: renderPrompt(prompt.template, {
      ...voiceVars(voice, ""),
      target_language: target,
      content: JSON.stringify(content, null, 1),
    }),
    maxTokens: 8000,
    temperature: 0.4,
  });
  return { ...content, ...out } as T;
}

/** Rewrites a post in another language in place, keeping everything else. */
export async function translatePost(postId: number, language: string, voice: VoiceProfile) {
  const target = language.trim();
  if (!target) throw new Error("Pick a language first");

  const db = getDb();
  const post = db.prepare("SELECT id, hook, body, hashtags FROM posts WHERE id = ?").get(postId) as
    | { id: number; hook: string | null; body: string; hashtags: string | null }
    | undefined;
  if (!post) throw new Error("Post not found");

  const out = await translateFields(
    {
      hook: post.hook ?? "",
      body: post.body,
      hashtags: parseJson<string[]>(post.hashtags, []),
    },
    target,
    voice,
  );

  const body = String(out.body ?? post.body);
  db.prepare(
    `UPDATE posts SET hook = ?, body = ?, hashtags = ?, char_count = ?, language = ?,
     updated_at = datetime('now') WHERE id = ?`,
  ).run(
    String(out.hook ?? ""),
    body,
    JSON.stringify(Array.isArray(out.hashtags) ? out.hashtags : []),
    body.length,
    target,
    postId,
  );

  return { language: target, model: modelLabel() };
}

/** Same, for the weekly digest. */
export async function translateDigest(digestId: number, language: string, voice: VoiceProfile) {
  const target = language.trim();
  if (!target) throw new Error("Pick a language first");

  const db = getDb();
  const digest = db
    .prepare("SELECT id, title, subtitle, markdown FROM digests WHERE id = ?")
    .get(digestId) as
    | { id: number; title: string | null; subtitle: string | null; markdown: string | null }
    | undefined;
  if (!digest) throw new Error("Digest not found");

  const out = await translateFields(
    {
      title: digest.title ?? "",
      subtitle: digest.subtitle ?? "",
      markdown: digest.markdown ?? "",
    },
    target,
    voice,
  );

  db.prepare(
    "UPDATE digests SET title = ?, subtitle = ?, markdown = ?, language = ? WHERE id = ?",
  ).run(
    String(out.title ?? ""),
    String(out.subtitle ?? ""),
    String(out.markdown ?? ""),
    target,
    digestId,
  );

  return { language: target, model: modelLabel() };
}
