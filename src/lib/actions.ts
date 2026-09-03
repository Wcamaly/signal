"use server";

import { revalidatePath } from "next/cache";
import { getDb, setSetting } from "./db";
import { getVoice, runPipeline, type Stage } from "./pipeline";
import { refinePost } from "./agents/writer";
import { seedSources } from "./ingest";
import type { VoiceProfile } from "./types";

export async function actionRunPipeline(stages: Stage[]) {
  const res = await runPipeline(stages);
  revalidatePath("/", "layout");
  return res;
}

export async function actionUpdatePost(id: number, patch: { body?: string; hook?: string; notes?: string }) {
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
  if (!fields.length) return;
  fields.push("updated_at = datetime('now')");
  db.prepare(`UPDATE posts SET ${fields.join(", ")} WHERE id = ?`).run(...values, id);
  revalidatePath("/posts");
}

export async function actionSetPostStatus(id: number, status: string, scheduledAt?: string | null) {
  const db = getDb();
  if (status === "published") {
    db.prepare("UPDATE posts SET status = 'published', published_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(id);
  } else if (status === "scheduled") {
    db.prepare("UPDATE posts SET status = 'scheduled', scheduled_at = ?, updated_at = datetime('now') WHERE id = ?").run(
      scheduledAt ?? null,
      id,
    );
  } else {
    db.prepare("UPDATE posts SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
  }
  revalidatePath("/posts");
  revalidatePath("/");
}

export async function actionRefinePost(id: number, instruction: string) {
  try {
    await refinePost(id, instruction, getVoice());
    revalidatePath("/posts");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function actionSaveVoice(voice: VoiceProfile) {
  setSetting("voice", voice);
  revalidatePath("/", "layout");
}

export async function actionSaveConfig(cfg: { platforms: string[]; posts_per_platform: number }) {
  setSetting("platforms", cfg.platforms);
  setSetting("posts_per_platform", cfg.posts_per_platform);
  revalidatePath("/", "layout");
}

export async function actionToggleSource(id: number, enabled: boolean) {
  getDb().prepare("UPDATE sources SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
  revalidatePath("/sources");
}

export async function actionAddSource(name: string, url: string, kind: string, category: string) {
  try {
    getDb()
      .prepare("INSERT INTO sources (name, url, kind, category, weight) VALUES (?, ?, ?, ?, 1.0)")
      .run(name, url, kind, category);
    revalidatePath("/sources");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function actionDeleteSource(id: number) {
  getDb().prepare("DELETE FROM sources WHERE id = ?").run(id);
  revalidatePath("/sources");
}

export async function actionSeedSources() {
  seedSources();
  revalidatePath("/sources");
}

export async function actionSetItemStatus(id: number, status: string) {
  getDb().prepare("UPDATE items SET status = ? WHERE id = ?").run(status, id);
  revalidatePath("/radar");
}
