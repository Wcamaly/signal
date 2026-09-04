"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  channelConfig,
  deleteChannel,
  getChannel,
  renderPost,
  saveChannel,
  type ChannelInput,
} from "./channels";
import { deleteCredential, readSecret, saveCredential, type CredentialScope } from "./credentials";
import { getDb, setSetting } from "./db";
import { fetchSource, seedSources } from "./ingest";
import { saveLlmConfig, saveProviderOptions, testLlm, type LlmConfig } from "./llm";
import { MAX_UPLOAD_BYTES, saveMedia } from "./media";
import { getPublisher } from "./publishers";
import { parseOg } from "./og";
import { getPrompt, resetPrompt, savePrompt, type PromptKey } from "./prompts";
import { fetchText } from "./sources/util";
import { getVoice, runPipeline, type Stage } from "./pipeline";
import { refinePost } from "./agents/writer";
import { translateDigest, translatePost } from "./agents/translate";
import type { Post, Source, VoiceProfile } from "./types";

type Result = { ok: boolean; error?: string };

async function guard(fn: () => void | Promise<void>): Promise<Result> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * An uploaded image lives at `/media/<hash>` on this instance, and a webhook
 * receiver is somewhere else entirely, so the path has to become an absolute
 * URL. The origin comes from the request rather than from configuration, which
 * means it is correct behind a proxy without anyone setting anything.
 */
async function absoluteUrl(pathOrUrl: string | null): Promise<string | null> {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}${pathOrUrl}`;
}

/* ---------- pipeline ---------- */

export async function actionRunPipeline(stages: Stage[]) {
  const res = await runPipeline(stages);
  revalidatePath("/", "layout");
  return res;
}

/* ---------- posts ---------- */

export async function actionUpdatePost(
  id: number,
  patch: {
    body?: string;
    hook?: string;
    notes?: string;
    image_url?: string | null;
    image_alt?: string | null;
  },
) {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  if (patch.body !== undefined) {
    fields.push("body = ?", "char_count = ?");
    values.push(patch.body, patch.body.length);
  }
  if (patch.hook !== undefined) {
    fields.push("hook = ?");
    values.push(patch.hook);
  }
  if (patch.notes !== undefined) {
    fields.push("notes = ?");
    values.push(patch.notes);
  }
  if (patch.image_url !== undefined) {
    fields.push("image_url = ?");
    values.push(patch.image_url || null);
  }
  if (patch.image_alt !== undefined) {
    fields.push("image_alt = ?");
    values.push(patch.image_alt || null);
  }
  if (!fields.length) return;
  fields.push("updated_at = datetime('now')");
  db.prepare(`UPDATE posts SET ${fields.join(", ")} WHERE id = ?`).run(...values, id);
  revalidatePath("/posts");
}

/**
 * Sets the link of a post. The cached link card belongs to the old URL, so it
 * goes with it — `actionUnfurlPostLink` fills it in again.
 */
export async function actionSetPostLink(id: number, link: string): Promise<Result> {
  const res = await guard(() => {
    const url = link.trim();
    if (url && !/^https?:\/\//i.test(url)) throw new Error("The link must be an http(s) URL");
    getDb()
      .prepare(
        `UPDATE posts SET link = ?, link_title = NULL, link_image = NULL,
         updated_at = datetime('now') WHERE id = ?`,
      )
      .run(url || null, id);
  });
  revalidatePath("/posts");
  return res;
}

/**
 * Reads the og: tags of the stored link once and caches them, so the preview
 * never fetches anything while rendering.
 */
export async function actionUnfurlPostLink(id: number): Promise<Result> {
  const res = await guard(async () => {
    const row = getDb().prepare("SELECT link FROM posts WHERE id = ?").get(id) as
      | { link: string | null }
      | undefined;
    const url = row?.link?.trim();
    if (!url) throw new Error("This post has no link yet");
    const { image, title } = parseOg(await fetchText(url, 8000), url);
    getDb()
      .prepare(
        "UPDATE posts SET link_title = ?, link_image = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .run(title, image, id);
  });
  revalidatePath("/posts");
  return res;
}

export async function actionSetPostStatus(id: number, status: string, scheduledAt?: string | null) {
  const db = getDb();
  if (status === "published") {
    db.prepare(
      "UPDATE posts SET status = 'published', published_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    ).run(id);
  } else if (status === "scheduled") {
    db.prepare(
      "UPDATE posts SET status = 'scheduled', scheduled_at = ?, updated_at = datetime('now') WHERE id = ?",
    ).run(scheduledAt ?? null, id);
  } else {
    db.prepare("UPDATE posts SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
  }
  revalidatePath("/posts");
  revalidatePath("/");
}

export async function actionRefinePost(id: number, instruction: string): Promise<Result> {
  const res = await guard(async () => {
    await refinePost(id, instruction, getVoice());
  });
  revalidatePath("/posts");
  return res;
}

/** Rewrites a post in another language. Does not run the pipeline again. */
export async function actionTranslatePost(id: number, language: string): Promise<Result> {
  const res = await guard(async () => {
    await translatePost(id, language, getVoice());
  });
  revalidatePath("/posts");
  return res;
}

/** Same, for the weekly digest. */
export async function actionTranslateDigest(id: number, language: string): Promise<Result> {
  const res = await guard(async () => {
    await translateDigest(id, language, getVoice());
  });
  revalidatePath("/digest");
  revalidatePath(`/digest/${id}`);
  return res;
}

/** Sends a post through its channel's publisher. */
export async function actionPublishPost(id: number): Promise<Result & { url?: string | null }> {
  const db = getDb();
  const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(id) as Post | undefined;
  if (!post) return { ok: false, error: "Post not found" };

  const channel = getChannel(post.platform);
  if (!channel) return { ok: false, error: `Channel "${post.platform}" no longer exists` };

  const publisher = getPublisher(channel.publisher);
  if (!publisher) return { ok: false, error: `Unknown publisher "${channel.publisher}"` };

  const source = post.item_id
    ? (db.prepare("SELECT url, title FROM items WHERE id = ?").get(post.item_id) as
        | { url: string; title: string }
        | undefined)
    : undefined;

  try {
    // The post's own link when it has one, the source signal's otherwise.
    const link = post.link ?? source?.url ?? null;
    const imageUrl = await absoluteUrl(post.image_url);

    const { url } = await publisher.publish({
      channel,
      post,
      rendered: renderPost(post, channel, { link, title: post.link_title ?? source?.title }),
      link,
      imageUrl,
      secret: channel.credential_id ? readSecret(channel.credential_id) : null,
      config: channelConfig(channel),
    });

    db.prepare(
      `UPDATE posts SET status = 'published', published_at = datetime('now'),
       published_url = COALESCE(?, published_url), updated_at = datetime('now') WHERE id = ?`,
    ).run(url ?? null, id);

    revalidatePath("/posts");
    revalidatePath("/");
    return { ok: true, url: url ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Stores an uploaded image and returns its URL. It writes nothing else: the
 * caller decides whether that URL becomes a post's image or the author's
 * avatar, and saves it the way it saves everything else.
 */
export async function actionUploadImage(form: FormData): Promise<Result & { url?: string }> {
  try {
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("No file received");
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("The image is larger than 8 MB");
    const url = saveMedia(Buffer.from(await file.arrayBuffer()), file.type);
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ---------- voice and general settings ---------- */

export async function actionSaveVoice(voice: VoiceProfile) {
  setSetting("voice", voice);
  revalidatePath("/", "layout");
}

/** The language of the interface. Not the language the model writes in. */
export async function actionSaveUiLanguage(locale: string) {
  setSetting("ui_language", locale);
  revalidatePath("/", "layout");
}

export async function actionSaveGeneral(cfg: { signals_per_week: number; ingest_max_age_days: number }) {
  setSetting("signals_per_week", Math.max(1, Math.min(30, Math.round(cfg.signals_per_week) || 8)));
  setSetting("ingest_max_age_days", Math.max(1, Math.min(90, Math.round(cfg.ingest_max_age_days) || 14)));
  revalidatePath("/", "layout");
}

/* ---------- sources ---------- */

export async function actionToggleSource(id: number, enabled: boolean) {
  getDb().prepare("UPDATE sources SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
  revalidatePath("/sources");
}

export async function actionAddSource(input: {
  name: string;
  url: string;
  kind: string;
  category: string;
  config: Record<string, string>;
}): Promise<Result> {
  const res = await guard(() => {
    if (!input.name.trim() || !input.url.trim()) throw new Error("Name and URL are required");
    const config = Object.fromEntries(
      Object.entries(input.config ?? {}).filter(([, v]) => String(v).trim() !== ""),
    );
    getDb()
      .prepare(
        "INSERT INTO sources (name, url, kind, category, weight, config) VALUES (?, ?, ?, ?, 1.0, ?)",
      )
      .run(input.name.trim(), input.url.trim(), input.kind, input.category, JSON.stringify(config));
  });
  revalidatePath("/sources");
  return res;
}

export async function actionDeleteSource(id: number) {
  getDb().prepare("DELETE FROM sources WHERE id = ?").run(id);
  revalidatePath("/sources");
}

export async function actionSeedSources() {
  seedSources();
  revalidatePath("/sources");
}

/** Fetches one source without writing anything, to validate it from the UI. */
export async function actionTestSource(id: number): Promise<Result & { found?: number; sample?: string }> {
  const source = getDb().prepare("SELECT * FROM sources WHERE id = ?").get(id) as Source | undefined;
  if (!source) return { ok: false, error: "Source not found" };
  try {
    const items = await fetchSource(source);
    return { ok: true, found: items.length, sample: items[0]?.title ?? "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function actionSetItemStatus(id: number, status: string) {
  getDb().prepare("UPDATE items SET status = ? WHERE id = ?").run(status, id);
  revalidatePath("/radar");
}

/* ---------- channels ---------- */

export async function actionSaveChannel(input: ChannelInput): Promise<Result> {
  const res = await guard(() => saveChannel(input));
  revalidatePath("/settings/channels");
  revalidatePath("/posts");
  revalidatePath("/", "layout");
  return res;
}

export async function actionDeleteChannel(key: string): Promise<Result> {
  const res = await guard(() => deleteChannel(key));
  revalidatePath("/settings/channels");
  revalidatePath("/posts");
  return res;
}

/* ---------- credentials ---------- */

export async function actionSaveCredential(input: {
  scope: CredentialScope;
  provider: string;
  label?: string;
  secret: string;
  extra?: Record<string, string>;
}): Promise<Result & { id?: number }> {
  try {
    const cred = saveCredential(input);
    revalidatePath("/settings/model");
    revalidatePath("/settings/channels");
    revalidatePath("/", "layout");
    return { ok: true, id: cred.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function actionDeleteCredential(id: number): Promise<Result> {
  const res = await guard(() => deleteCredential(id));
  revalidatePath("/settings/model");
  revalidatePath("/settings/channels");
  revalidatePath("/", "layout");
  return res;
}

/* ---------- model ---------- */

export async function actionSaveLlmConfig(cfg: Partial<LlmConfig>): Promise<Result> {
  const res = await guard(() => saveLlmConfig(cfg));
  revalidatePath("/", "layout");
  return res;
}

/** Non-secret provider settings, such as the Anthropic workspace id. */
export async function actionSaveProviderOptions(
  provider: string,
  values: Record<string, string>,
): Promise<Result> {
  const res = await guard(() => saveProviderOptions(provider, values));
  revalidatePath("/", "layout");
  return res;
}

export async function actionTestLlm() {
  return testLlm();
}

/* ---------- prompts ---------- */

export async function actionSavePrompt(
  key: PromptKey,
  value: { system: string; template: string },
): Promise<Result> {
  const res = await guard(() => savePrompt(key, value));
  revalidatePath("/settings/prompts");
  return res;
}

export async function actionResetPrompt(key: PromptKey): Promise<Result & { prompt?: { system: string; template: string } }> {
  try {
    resetPrompt(key);
    revalidatePath("/settings/prompts");
    const prompt = getPrompt(key);
    return { ok: true, prompt: { system: prompt.system, template: prompt.template } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
