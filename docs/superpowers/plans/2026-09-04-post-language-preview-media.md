# Post language, network preview, images and links — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each channel (and each individual post) choose the language it is written in, show the post as the network will actually render it, and give a post a real image and a real link.

**Architecture:** Nine self-migrating columns carry the new state. Language has two levels — a working language on the voice profile for the curator and the digest, and an output language per channel for posts — with a per-artefact override implemented as a translation pass through a new fifth prompt rather than a regeneration. Images arrive from the feed at ingest and from `og:image` for the handful of items that survive curation; uploads land in `DATA_DIR/media/` under a content hash and are served by a route handler that resolves the name against the directory listing. The preview is pure frontend: a registry of skins in `src/components/previews/`, each rendering the *channel template's output* in an isolated theme, with a generic fallback for channels the user invents.

**Tech Stack:** Next.js 16.3.4 (App Router, server actions, route handlers), React 19.2.8, better-sqlite3, Tailwind 4, TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-09-04-post-language-preview-media-design.md`

---

## Before you start

**This is not the Next.js you know.** `AGENTS.md` requires reading the relevant guide in `node_modules/next/dist/docs/` before writing Next code. The two that matter here are already reflected in this plan:

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` — Route Handlers are `route.ts` under `app/`, use the Web `Request`/`Response` APIs, and are not cached by default.
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` — `context.params` is a **promise**: `{ params }: { params: Promise<{ name: string }> }`.
- `headers()` is async: `const h = await headers()`.

**There is no test framework**, and adding one is a PR of its own (CONTRIBUTING.md:138). Verification is therefore:

- `npm run check` (eslint + `tsc --noEmit`) after every task — it passes on a clean tree today, so any output is yours.
- For pure helpers, a real behavioural check with Node's built-in type stripping:
  `node --input-type=module --no-warnings -e "import { fn } from './src/lib/file.ts'; …"`
  This works for any file whose imports are bare specifiers or `node:` builtins — relative imports without an extension will not resolve, which is why the pure helpers below have no relative imports.
- The manual pass in spec §11 at the end.

**Branch:** work continues on `feat/post-language-preview-media`. `main` is protected; a `pre-push` hook refuses direct pushes. Land through a pull request.

**File structure this plan produces:**

| File | Responsibility |
|---|---|
| `src/lib/languages.ts` | The offered languages and the inherit rule. No imports — pure. |
| `src/lib/og.ts` | Open Graph parser. Pure: the caller fetches, this parses. |
| `src/lib/images.ts` | The `og:image` pass over the items that survived curation. |
| `src/lib/media.ts` | The media store under `DATA_DIR/media/`. |
| `src/lib/agents/translate.ts` | One translation call, two callers (post, digest). |
| `src/app/media/[name]/route.ts` | Serves a stored file. |
| `src/components/LanguageSelect.tsx` | The language control, used in three places. |
| `src/components/PostEditor.tsx` | Textarea and save. |
| `src/components/PostMedia.tsx` | Image and link of a post. |
| `src/components/PostLanguage.tsx` | The per-post language override. |
| `src/components/PostPreview.tsx` | Picks the skin, assembles its props. |
| `src/components/DigestLanguage.tsx` | The per-digest language override. |
| `src/components/previews/types.ts` | `PreviewProps` and the pure helpers. |
| `src/components/previews/Avatar.tsx` | Avatar or initials on the channel colour. |
| `src/components/previews/index.ts` | `getPreviewSkin()` — the registry. |
| `src/components/previews/generic.tsx` | Fallback skin. |
| `src/components/previews/linkedin.tsx` | |
| `src/components/previews/x.tsx` | |
| `src/components/previews/instagram.tsx` | |

---

# Part 1 — Schema and language

Spec §9 step 1. When this part is done, languages work end to end with no preview and no images.

### Task 1: The nine columns and the types

**Files:**
- Modify: `src/lib/db.ts:141-144`
- Modify: `src/lib/types.ts`
- Modify: `src/components/VoiceForm.tsx:8-36`

- [ ] **Step 1: Add the migrations**

In `src/lib/db.ts`, replace the two existing migration lines (141-144) with:

```ts
  // Migrations for databases created by earlier versions.
  ensureColumn(db, "sources", "config", "TEXT DEFAULT '{}'");
  ensureColumn(db, "posts", "published_url", "TEXT");
  // Post language, images and links.
  ensureColumn(db, "items", "image_url", "TEXT");
  ensureColumn(db, "channels", "language", "TEXT"); // NULL = inherit the voice profile
  ensureColumn(db, "digests", "language", "TEXT");
  ensureColumn(db, "posts", "language", "TEXT");
  ensureColumn(db, "posts", "link", "TEXT");
  ensureColumn(db, "posts", "link_title", "TEXT");
  ensureColumn(db, "posts", "link_image", "TEXT");
  ensureColumn(db, "posts", "image_url", "TEXT");
  ensureColumn(db, "posts", "image_alt", "TEXT");
```

- [ ] **Step 2: Add the fields to the types**

In `src/lib/types.ts`:

Add to `Item`, after `cluster`:

```ts
  image_url: string | null;
```

Add to `Digest`, after `item_ids`:

```ts
  language: string | null;
```

Add to `Channel`, after `hint`:

```ts
  /** Output language of this channel's posts. NULL inherits the voice profile. */
  language: string | null;
```

Add to `Post`, after `visual_brief`:

```ts
  language: string | null;
  link: string | null;
  link_title: string | null;
  link_image: string | null;
  image_url: string | null;
  image_alt: string | null;
```

Add to `VoiceProfile`, after `language`:

```ts
  /** URL of the author's picture, shown in the previews. */
  avatar: string;
```

Add to `DEFAULT_VOICE`, after `language: "English",`:

```ts
  avatar: "",
```

- [ ] **Step 3: Keep the example profile compiling**

`EXAMPLE` in `src/components/VoiceForm.tsx` is typed `VoiceProfile`, so it needs the new field too. Add after `language: "English",` (line 34):

```ts
  avatar: "",
```

- [ ] **Step 4: Verify the migration actually runs**

```bash
node --input-type=module --no-warnings -e "
import { getDb } from './src/lib/db.ts';
const db = getDb();
for (const t of ['items', 'channels', 'digests', 'posts']) {
  console.log(t, db.prepare(\`PRAGMA table_info(\${t})\`).all().map((c) => c.name).join(', '));
}
"
```

Expected: `items` ends with `image_url`; `channels` ends with `language`; `digests` ends with `language`; `posts` ends with `language, link, link_title, link_image, image_url, image_alt`.

- [ ] **Step 5: Verify the build**

Run: `npm run check`
Expected: no output beyond the npm banners.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db.ts src/lib/types.ts src/components/VoiceForm.tsx
git commit -m "feat: schema for post language, images and links"
```

---

### Task 2: The language list and the inherit rule

**Files:**
- Create: `src/lib/languages.ts`

- [ ] **Step 1: Write the module**

```ts
/**
 * The languages offered in the pickers. The stored value is the label itself,
 * not a locale code, because every prompt reads `Write in this language:
 * {{language}}` — so there is no mapping table anywhere in the pipeline.
 *
 * "Other…" in the UI lets you type anything, which makes this list a
 * convenience rather than a constraint.
 */
export const LANGUAGES = [
  "Español",
  "English",
  "Português",
  "Français",
  "Deutsch",
  "Italiano",
] as const;

/**
 * Which language an artefact is actually written in. An empty or missing value
 * means inherit: a channel with no language of its own follows the working
 * language of the voice profile.
 */
export function resolveLanguage(own: string | null | undefined, inherited: string): string {
  return (own ?? "").trim() || inherited;
}
```

- [ ] **Step 2: Verify the inherit rule**

```bash
node --input-type=module --no-warnings -e "
import { resolveLanguage, LANGUAGES } from './src/lib/languages.ts';
console.log(resolveLanguage('Español', 'English'));
console.log(resolveLanguage(null, 'English'));
console.log(resolveLanguage('   ', 'English'));
console.log(LANGUAGES.length);
"
```

Expected:
```
Español
English
English
6
```

- [ ] **Step 3: Verify the build**

Run: `npm run check`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/languages.ts
git commit -m "feat: language list and the inherit rule"
```

---

### Task 3: The language control, and the voice profile uses it

**Files:**
- Create: `src/components/LanguageSelect.tsx`
- Modify: `src/components/VoiceForm.tsx:140-147`

- [ ] **Step 1: Write the control**

Create `src/components/LanguageSelect.tsx`:

```tsx
"use client";

import { useState } from "react";
import { LANGUAGES } from "@/lib/languages";

const OTHER = "__other__";

/**
 * A picker over the offered languages with an escape hatch. `inheritLabel`
 * turns the empty value into a real option ("inherit"), which is what a channel
 * with no language of its own stores.
 */
export default function LanguageSelect({
  value,
  onChange,
  inheritLabel,
  className = "select",
}: {
  value: string;
  onChange: (value: string) => void;
  inheritLabel?: string;
  className?: string;
}) {
  const known = value === "" || (LANGUAGES as readonly string[]).includes(value);
  const [free, setFree] = useState(!known);

  if (free) {
    return (
      <div className="flex gap-2">
        <input
          className="input"
          value={value}
          placeholder="Nederlands, 日本語, Català…"
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm shrink-0"
          onClick={() => {
            setFree(false);
            onChange(inheritLabel === undefined ? "English" : "");
          }}
        >
          List
        </button>
      </div>
    );
  }

  return (
    <select
      className={className}
      value={value}
      onChange={(e) => {
        if (e.target.value === OTHER) {
          setFree(true);
          return;
        }
        onChange(e.target.value);
      }}
    >
      {inheritLabel !== undefined && <option value="">{inheritLabel}</option>}
      {LANGUAGES.map((l) => (
        <option key={l} value={l}>
          {l}
        </option>
      ))}
      <option value={OTHER}>Other…</option>
    </select>
  );
}
```

- [ ] **Step 2: Use it in the voice profile**

In `src/components/VoiceForm.tsx`, add the import next to the others:

```tsx
import LanguageSelect from "./LanguageSelect";
```

Replace the Language field (lines 140-147) with:

```tsx
        <div className="grid grid-cols-2 gap-x-4">
          <Field
            label="Working language"
            hint="The language the curator and the weekly digest are written in. Each channel can write its posts in another one, under Channels."
          >
            <LanguageSelect value={v.language} onChange={(l) => set("language", l)} />
          </Field>
          <Field label="Close / CTA">
            <input className="input" value={v.cta} onChange={(e) => set("cta", e.target.value)} />
          </Field>
        </div>
```

- [ ] **Step 3: Verify the build**

Run: `npm run check`
Expected: clean.

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`, open `http://localhost:3000/settings`.
Expected: "Working language" is a dropdown showing the stored value. Picking **Other…** turns it into a text input with a **List** button that goes back. Saving and reloading keeps whatever you typed.

- [ ] **Step 5: Commit**

```bash
git add src/components/LanguageSelect.tsx src/components/VoiceForm.tsx
git commit -m "feat: language picker on the voice profile"
```

---

### Task 4: A language per channel

**Files:**
- Modify: `src/lib/channels.ts:5-20,155-208`
- Modify: `src/components/ChannelManager.tsx`

- [ ] **Step 1: Add the field to the channel input**

In `src/lib/channels.ts`, add to `ChannelInput` after `hint: string;`:

```ts
  /** Output language. Empty inherits the working language of the voice profile. */
  language: string;
```

The seeds do not set a language — NULL means inherit, which is the right default for all eight. Keep them compiling by widening the `Seed` omission (line 20):

```ts
type Seed = Omit<ChannelInput, "credential_id" | "config" | "language"> & {
  config?: Record<string, unknown>;
};
```

- [ ] **Step 2: Persist it**

In `saveChannel`, add to the `row` object after `hint: input.hint ?? "",`:

```ts
    language: input.language?.trim() || null,
```

Replace the INSERT (lines 196-207) with:

```ts
  getDb()
    .prepare(
      `INSERT INTO channels (key, label, char_limit, color, hint, language, template, publisher, config, credential_id, posts_per_run, enabled, sort_order)
       VALUES (@key, @label, @char_limit, @color, @hint, @language, @template, @publisher, @config, @credential_id, @posts_per_run, @enabled, @sort_order)
       ON CONFLICT(key) DO UPDATE SET
         label = excluded.label, char_limit = excluded.char_limit, color = excluded.color,
         hint = excluded.hint, language = excluded.language, template = excluded.template,
         publisher = excluded.publisher, config = excluded.config,
         credential_id = excluded.credential_id,
         posts_per_run = excluded.posts_per_run, enabled = excluded.enabled,
         sort_order = excluded.sort_order`,
    )
    .run(row);
```

Add `language: null,` to the `channelLabel` fallback object, after `hint: null,` (line 164).

- [ ] **Step 3: Add the field to the channel editor**

In `src/components/ChannelManager.tsx`:

Add the import:

```tsx
import LanguageSelect from "./LanguageSelect";
```

Add to `Draft` after `hint: string;`:

```tsx
  language: string;
```

Add to `BLANK` after `hint: "",`:

```tsx
  language: "",
```

Add to `toDraft`'s returned object after `hint: c.hint ?? "",`:

```tsx
    language: c.language ?? "",
```

Replace the format-hint block (lines 152-159) with the hint plus the language and handle, side by side:

```tsx
      <div>
        <span className="label">Format hint (goes into the writer prompt)</span>
        <textarea
          className="textarea min-h-[70px]"
          value={d.hint}
          onChange={(e) => setD({ ...d, hint: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="label">Language</span>
          <LanguageSelect
            value={d.language}
            onChange={(language) => setD({ ...d, language })}
            inheritLabel="Inherit from the voice profile"
          />
          <p className="text-[11px] text-faint mt-1">
            The posts of this channel are written in this language. Any single post can still be
            changed from the queue.
          </p>
        </div>
        {!publisher.configFields.some((f) => f.key === "handle") && (
          <div>
            <span className="label">Handle (preview only)</span>
            <input
              className="input font-mono !text-[12px]"
              placeholder="@you"
              value={d.config.handle ?? ""}
              onChange={(e) => setD({ ...d, config: { ...d.config, handle: e.target.value } })}
            />
            <p className="text-[11px] text-faint mt-1">
              Shown under your name in the preview. Not sent anywhere.
            </p>
          </div>
        )}
      </div>
```

The publisher `<select>` currently wipes `config` when the publisher changes, which would take the handle with it. Keep it (line 183):

```tsx
            onChange={(e) =>
              setD({
                ...d,
                publisher: e.target.value,
                // Publisher options are per publisher, but the preview handle is not.
                config: d.config.handle ? { handle: d.config.handle } : {},
              })
            }
```

Show it in the collapsed row too — replace the summary line (lines 319-321) with:

```tsx
              <p className="text-[11.5px] text-faint mt-1">
                {c.char_limit} chars · {c.posts_per_run} post{c.posts_per_run === 1 ? "" : "s"} per run
                {c.language ? ` · ${c.language}` : ""}
              </p>
```

- [ ] **Step 4: Verify the build**

Run: `npm run check`
Expected: clean.

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`, open `http://localhost:3000/settings/channels`, edit LinkedIn, set the language to **Español**, save, reload.
Expected: the collapsed row reads `3000 chars · 2 posts per run · Español` and reopening the editor shows Español selected. A channel left on "Inherit from the voice profile" shows no language in its row.

- [ ] **Step 6: Commit**

```bash
git add src/lib/channels.ts src/components/ChannelManager.tsx
git commit -m "feat: output language per channel"
```

---

### Task 5: The `translate` prompt

**Files:**
- Modify: `src/lib/prompts.ts:4,190`

The override is a translation pass, not a regeneration: regenerating would throw away the edits already made and cost a full generation. One prompt covers both artefacts because it has one shape rule — it receives a JSON object and returns the same keys, translated.

- [ ] **Step 1: Widen the key union**

Line 4 of `src/lib/prompts.ts`:

```ts
export type PromptKey = "curator" | "digest" | "writer" | "refine" | "translate";
```

- [ ] **Step 2: Add the definition**

In `PROMPT_DEFINITIONS`, after the `refine` entry and before the closing `};`:

```ts
  translate: {
    key: "translate",
    label: "Translate",
    description:
      "Rewrites an existing post or the weekly digest in another language, keeping your voice. Used by the language selector in the queue and on the digest — it never regenerates the piece from scratch.",
    variables: [
      ...VOICE_VARS,
      { name: "target_language", description: "Language to translate into" },
      { name: "content", description: "JSON object with the fields to translate" },
    ],
    system: `You translate an author's own writing into another language. You are not a dictionary: you rewrite it so it reads as if they had written it in that language from the start.

RULES
- Keep the register, the rhythm and the length. A short line with an edge stays a short line with an edge.
- Keep the technical vocabulary the target audience actually uses in English (prompt, embedding, fine-tuning, deploy) in English.
- Do not translate hashtags word for word: use the tag that audience searches, or leave it as it is.
- Never translate URLs, product names, company names, or code.
- Obey the banned list literally in the target language too: not one of those words or phrases may appear.
- Add nothing, remove nothing, explain nothing. Same content, another language.`,
    template: `AUTHOR: {{role}}, {{company}}. Tone: {{tone}}.
Never use: {{banned}}

TARGET LANGUAGE: {{target_language}}

CONTENT (JSON):
{{content}}

Translate the values into {{target_language}}. Return ONLY a JSON object with exactly the same keys as the input, nothing else.`,
  },
```

Note `{{target_language}}` rather than `{{language}}`: `{{language}}` is still injected by `voiceVars` and still holds the *working* language, which is the language being translated *away from*.

- [ ] **Step 3: Verify the build**

Run: `npm run check`
Expected: clean. `PROMPT_KEYS` is `Object.keys(PROMPT_DEFINITIONS)`, so the Settings → Prompts page picks the new prompt up with no change.

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`, open `http://localhost:3000/settings/prompts`.
Expected: a fifth card, **Translate**, that expands, saves and resets like the other four.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompts.ts
git commit -m "feat: translate prompt"
```

---

### Task 6: The translation agent

**Files:**
- Create: `src/lib/agents/translate.ts`

- [ ] **Step 1: Write it**

```ts
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
  ).run(String(out.title ?? ""), String(out.subtitle ?? ""), String(out.markdown ?? ""), target, digestId);

  return { language: target, model: modelLabel() };
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run check`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agents/translate.ts
git commit -m "feat: translation agent for posts and digests"
```

---

### Task 7: The translate actions

**Files:**
- Modify: `src/lib/actions.ts:19,85-91`

- [ ] **Step 1: Import the agent**

Next to the existing `refinePost` import (line 19):

```ts
import { refinePost } from "./agents/writer";
import { translateDigest, translatePost } from "./agents/translate";
```

- [ ] **Step 2: Add the actions**

After `actionRefinePost` (line 91):

```ts
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
```

- [ ] **Step 3: Verify the build**

Run: `npm run check`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions.ts
git commit -m "feat: translate actions for posts and digests"
```

---

### Task 8: The writer honours the channel's language, the digest records its own

**Files:**
- Modify: `src/lib/agents/writer.ts:41-92`
- Modify: `src/lib/agents/digest.ts:54-67`

- [ ] **Step 1: Resolve the channel's language in the writer**

In `src/lib/agents/writer.ts`, add the import:

```ts
import { resolveLanguage } from "../languages";
```

Replace the `insert` statement (lines 43-46) with one that carries the language:

```ts
  const insert = db.prepare(
    `INSERT INTO posts (digest_id, item_id, platform, angle, hook, body, hashtags, visual_brief, char_count, model, status, language)
     VALUES (@digest_id, @item_id, @platform, @angle, @hook, @body, @hashtags, @visual_brief, @char_count, @model, 'draft', @language)`,
  );
```

At the top of the channel loop (after line 48, `for (const channel of channels) {`):

```ts
    // The channel's language wins over the working language of the profile.
    // The prompt variable keeps its name — a user who has customised the writer
    // prompt has `{{language}}` in it and overrides are never migrated.
    const language = resolveLanguage(channel.language, voice.language);
```

In the `renderPrompt` call, add `language` **after** the `voiceVars` spread so it overrides it (line 58):

```ts
        prompt: renderPrompt(prompt.template, {
          ...voiceVars(voice, digest.week_key),
          language,
          channel_label: channel.label,
```

In the `insert.run({...})` object (line 78), add:

```ts
        language,
```

- [ ] **Step 2: Record the digest's language**

In `src/lib/agents/digest.ts`, replace the INSERT (lines 54-67) with:

```ts
  db.prepare(
    `INSERT INTO digests (week_key, title, subtitle, markdown, item_ids, model, status, language)
     VALUES (@week, @title, @subtitle, @markdown, @item_ids, @model, 'draft', @language)
     ON CONFLICT(week_key) DO UPDATE SET
       title = excluded.title, subtitle = excluded.subtitle, markdown = excluded.markdown,
       item_ids = excluded.item_ids, model = excluded.model, language = excluded.language,
       created_at = datetime('now')`,
  ).run({
    week,
    title: result.title,
    subtitle: result.subtitle,
    markdown: result.markdown,
    item_ids: JSON.stringify(items.map((i) => i.id)),
    model: modelLabel(),
    language: voice.language,
  });
```

- [ ] **Step 3: Verify the build**

Run: `npm run check`
Expected: clean.

- [ ] **Step 4: Verify the resolution end to end**

With a model configured, set the working language to English, set the LinkedIn channel to Español, then run the writing stage from the sidebar and check what was stored:

```bash
node --input-type=module --no-warnings -e "
import { getDb } from './src/lib/db.ts';
console.table(getDb().prepare('SELECT platform, language, substr(body,1,60) AS body FROM posts ORDER BY id DESC LIMIT 6').all());
"
```

Expected: the LinkedIn rows carry `Español` and read as Spanish; rows from a channel with no language carry `English`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/writer.ts src/lib/agents/digest.ts
git commit -m "feat: posts take their channel's language, digests record theirs"
```

---

### Task 9: The per-post language override

**Files:**
- Create: `src/components/PostLanguage.tsx`
- Modify: `src/components/PostCard.tsx:23-31,104-128`
- Modify: `src/app/posts/page.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/PostLanguage.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionTranslatePost } from "@/lib/actions";
import LanguageSelect from "./LanguageSelect";

/**
 * Changing the language of one post translates it in place — it does not run
 * the writer again, so the edits already made survive.
 */
export default function PostLanguage({ postId, language }: { postId: number; language: string }) {
  const [target, setTarget] = useState(language);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function translate() {
    setError(null);
    start(async () => {
      const res = await actionTranslatePost(postId, target);
      if (!res.ok) setError(res.error ?? "Error");
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <button
        className="chip hover:!text-ink hover:!border-line-strong !text-[10px] !py-0"
        onClick={() => setOpen(true)}
        title="Rewrite this post in another language"
      >
        {language || "language"} ▾
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span className="w-40">
        <LanguageSelect
          value={target}
          onChange={setTarget}
          className="select !py-1 !text-[12px]"
        />
      </span>
      <button
        className="btn btn-sm"
        onClick={translate}
        disabled={pending || !target.trim() || target === language}
      >
        {pending ? "Translating…" : "Rewrite"}
      </button>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => {
          setTarget(language);
          setOpen(false);
          setError(null);
        }}
        disabled={pending}
      >
        Cancel
      </button>
      {error && (
        <span className="text-[11.5px]" style={{ color: "var(--bad)" }}>
          {error}
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Put it in the card header**

In `src/components/PostCard.tsx`, add the import:

```tsx
import PostLanguage from "./PostLanguage";
```

Add `language` to the props (lines 23-31):

```tsx
export default function PostCard({
  post,
  channel,
  publisherLabel,
  language,
}: {
  post: Post & { source_url?: string | null; source_title?: string | null };
  channel: Channel;
  publisherLabel: string;
  /** Already resolved: the post's own language, or the channel's, or the profile's. */
  language: string;
}) {
```

In the header chip row, after the `{post.status}` chip (line 112):

```tsx
            <PostLanguage postId={post.id} language={language} />
```

- [ ] **Step 3: Resolve the language on the page**

In `src/app/posts/page.tsx`, add the imports:

```tsx
import { resolveLanguage } from "@/lib/languages";
import { getVoice } from "@/lib/pipeline";
```

After `const publishers = publisherCatalog();` (line 26):

```tsx
  const voice = getVoice();
```

In the `posts.map` callback, after the `channelLabel` line (line 100):

```tsx
            // A post written before this feature has no language of its own, so
            // it falls back the same way a new channel does.
            const language = resolveLanguage(
              p.language,
              resolveLanguage(channel.language, voice.language),
            );
```

And pass it to the card:

```tsx
              <PostCard
                key={p.id}
                post={p}
                channel={channel}
                language={language}
                publisherLabel={
                  publishers.find((pub) => pub.id === channel.publisher)?.label ?? "Manual"
                }
              />
```

- [ ] **Step 4: Verify the build**

Run: `npm run check`
Expected: clean.

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`, open `http://localhost:3000/posts` with a model configured.
Expected: every card shows a language chip. Clicking it opens the picker; choosing another language and pressing **Rewrite** replaces the body, the hashtags and the character counter, and the chip then reads the new language. With no model configured, the error reads "Configure an LLM provider under Model & keys to translate" and nothing is written.

- [ ] **Step 6: Commit**

```bash
git add src/components/PostLanguage.tsx src/components/PostCard.tsx src/app/posts/page.tsx
git commit -m "feat: per-post language override in the queue"
```

---

### Task 10: The per-digest language override

**Files:**
- Create: `src/components/DigestLanguage.tsx`
- Modify: `src/app/digest/[id]/page.tsx:14-26,63-64`

- [ ] **Step 1: Write the component**

Create `src/components/DigestLanguage.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionTranslateDigest } from "@/lib/actions";
import LanguageSelect from "./LanguageSelect";

export default function DigestLanguage({
  digestId,
  language,
}: {
  digestId: number;
  language: string;
}) {
  const [target, setTarget] = useState(language);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function translate() {
    setError(null);
    start(async () => {
      const res = await actionTranslateDigest(digestId, target);
      if (!res.ok) setError(res.error ?? "Error");
      else router.refresh();
    });
  }

  return (
    <div>
      <h3 className="kicker mb-2.5">Language</h3>
      <LanguageSelect value={target} onChange={setTarget} />
      <button
        className="btn btn-sm w-full mt-2"
        onClick={translate}
        disabled={pending || !target.trim() || target === language}
      >
        {pending ? "Translating…" : `Rewrite in ${target || "…"}`}
      </button>
      <p className="text-[11px] text-faint mt-1.5 leading-snug">
        Translates the document in place. It does not run the pipeline again, and it does not touch
        the posts already written from it.
      </p>
      {error && (
        <p className="text-[11.5px] mt-1.5" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Put it in the sidebar**

In `src/app/digest/[id]/page.tsx`, add the imports:

```tsx
import { getVoice } from "@/lib/pipeline";
import { resolveLanguage } from "@/lib/languages";
import DigestLanguage from "@/components/DigestLanguage";
```

Add `language: string | null;` to the inline row type (inside the `as { … }` block, after `item_ids: string;`).

After `const channels = getChannels();` (line 28):

```tsx
  const language = resolveLanguage(digest.language, getVoice().language);
```

In the `<aside>`, as the first child (before the "Signals used" block on line 64):

```tsx
          <DigestLanguage digestId={digest.id} language={language} />
```

- [ ] **Step 3: Verify the build**

Run: `npm run check`
Expected: clean.

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`, open a digest at `http://localhost:3000/digest`, pick a different language and press **Rewrite in …**.
Expected: the title, the subtitle and the whole markdown body come back in that language, the markdown structure (`## The signals`, the links) survives, and the button disables itself again because the stored language now matches.

- [ ] **Step 5: Commit**

```bash
git add src/components/DigestLanguage.tsx src/app/digest/[id]/page.tsx
git commit -m "feat: per-digest language override"
```

---

**Part 1 is shippable on its own.** Languages work with no preview and no images.

---

# Part 2 — Ingest images and links

Spec §9 step 2. Still no UI beyond a URL in a field; this fills the data the preview will need.

### Task 11: The Open Graph parser

**Files:**
- Create: `src/lib/og.ts`

The parser is pure and has **no relative imports** on purpose: the caller fetches the page with the project's own `fetchText` (its user agent, its timeout), and this file only parses. That is what makes one parser serve both the ingest pass and the link unfurl — and what makes it verifiable from a one-line Node command.

- [ ] **Step 1: Write it**

```ts
/**
 * Open Graph reader. Pure by design: the caller fetches the HTML with the
 * project's own `fetchText` and passes it here, so the same parser serves the
 * ingest image pass and the link unfurl in the publication queue.
 */
export type OgTags = { image: string | null; title: string | null };

/** `<meta property="og:image" content="…">`, in either attribute order. */
function meta(html: string, attr: string, value: string): string | null {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${escaped}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${escaped}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** og:image is often a relative path; a preview and a webhook both need it absolute. */
function absolute(url: string, baseUrl: string): string | null {
  try {
    const resolved = new URL(url, baseUrl);
    return resolved.protocol === "http:" || resolved.protocol === "https:"
      ? resolved.toString()
      : null;
  } catch {
    return null;
  }
}

export function parseOg(html: string, baseUrl: string): OgTags {
  // Everything we want lives in <head>; reading further is wasted work on a
  // long article and risks matching a meta tag inside the body.
  const head = html.slice(0, 200_000);

  const rawImage =
    meta(head, "property", "og:image") ??
    meta(head, "name", "og:image") ??
    meta(head, "name", "twitter:image") ??
    meta(head, "property", "twitter:image");

  const rawTitle =
    meta(head, "property", "og:title") ??
    meta(head, "name", "twitter:title") ??
    head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
    null;

  const title = rawTitle ? decodeEntities(rawTitle).replace(/\s+/g, " ").trim().slice(0, 300) : "";

  return {
    image: rawImage ? absolute(decodeEntities(rawImage), baseUrl) : null,
    title: title || null,
  };
}
```

- [ ] **Step 2: Verify the parsing**

```bash
node --input-type=module --no-warnings -e "
import { parseOg } from './src/lib/og.ts';
const base = 'https://example.com/articles/one';

// Standard order, absolute URL.
console.log(parseOg('<meta property=\"og:image\" content=\"https://cdn.example.com/a.png\"><title>Ignored</title>', base));

// Reversed attribute order, relative path, entity in the title.
console.log(parseOg('<meta content=\"/img/b.jpg?w=1&amp;h=2\" property=\"og:image\"><meta property=\"og:title\" content=\"Ben &amp; Co\">', base));

// No og: tags at all — falls back to <title>, no image.
console.log(parseOg('<html><head><title>  Plain\n  page  </title></head>', base));

// twitter:image as the only image.
console.log(parseOg('<meta name=\"twitter:image\" content=\"https://cdn.example.com/t.png\">', base));

// A javascript: URL must not survive.
console.log(parseOg('<meta property=\"og:image\" content=\"javascript:alert(1)\">', base));
"
```

Expected, in order:
```
{ image: 'https://cdn.example.com/a.png', title: 'Ignored' }
{ image: 'https://example.com/img/b.jpg?w=1&h=2', title: 'Ben & Co' }
{ image: null, title: 'Plain page' }
{ image: 'https://cdn.example.com/t.png', title: null }
{ image: null, title: null }
```

- [ ] **Step 3: Verify the build**

Run: `npm run check`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/og.ts
git commit -m "feat: open graph parser"
```

---

### Task 12: Images out of the feeds

**Files:**
- Modify: `src/lib/sources/util.ts:6-13`
- Modify: `src/lib/sources/kinds/feed.ts`
- Modify: `src/lib/sources/kinds/reddit.ts:5-22,52-62`
- Modify: `src/lib/ingest.ts:33-55`

- [ ] **Step 1: Widen `RawItem`**

In `src/lib/sources/util.ts`:

```ts
export type RawItem = {
  external_id: string;
  title: string;
  url: string;
  author?: string | null;
  summary?: string | null;
  published_at?: string | null;
  /** Absolute URL of the item's own image, when the feed carries one. */
  image_url?: string | null;
};
```

- [ ] **Step 2: Extract the image in `feed.ts`**

Add this helper above `parseFeed`:

```ts
/**
 * Picks an image out of whatever the feed offers. RSS puts it in `enclosure`,
 * `media:thumbnail` or `media:content`; Atom feeds that carry video — YouTube
 * above all — nest the same tags inside a `media:group`.
 */
function feedImage(node: Record<string, unknown>): string | null {
  const scopes = [node, node["media:group"] as Record<string, unknown> | undefined];
  for (const scope of scopes) {
    if (!scope) continue;
    for (const key of ["media:thumbnail", "media:content", "enclosure"]) {
      for (const entry of asArray(scope[key] as Record<string, unknown>[])) {
        const url = String(entry?.["@_url"] ?? "").trim();
        if (!/^https?:\/\//i.test(url)) continue;
        // An enclosure is also how a podcast ships its audio file.
        const type = String(entry?.["@_type"] ?? entry?.["@_medium"] ?? "");
        if (
          key === "enclosure" &&
          !type.startsWith("image") &&
          !/\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)
        ) {
          continue;
        }
        return url;
      }
    }
  }
  return null;
}
```

Add `image_url: feedImage(it),` to the RSS branch's returned object (after `published_at`), and `image_url: feedImage(e),` to the Atom branch's returned object.

- [ ] **Step 3: Extract the thumbnail in `reddit.ts`**

Add `thumbnail?: string;` to the post shape inside `Listing` (after `is_self: boolean;`).

Add to the mapped `RawItem` (after `published_at`):

```ts
            // Reddit answers "self", "default" or "nsfw" when there is no image.
            image_url: /^https?:\/\//i.test(p.thumbnail ?? "") ? (p.thumbnail ?? null) : null,
```

- [ ] **Step 4: Persist it**

In `src/lib/ingest.ts`, replace the `insert` statement (lines 33-37) with:

```ts
  const insert = db.prepare(
    `INSERT INTO items (source_id, external_id, title, url, author, summary, published_at, week_key, image_url, status)
     VALUES (@source_id, @external_id, @title, @url, @author, @summary, @published_at, @week_key, @image_url, 'new')
     ON CONFLICT(external_id) DO NOTHING`,
  );
```

And add to `insert.run({...})` (after `week_key: weekKey(pub),`):

```ts
        image_url: r.image_url ?? null,
```

- [ ] **Step 5: Verify the build**

Run: `npm run check`
Expected: clean.

- [ ] **Step 6: Verify against a real feed**

Run the ingest stage from the sidebar (or `curl http://localhost:3000/api/cron?stages=ingest`), then:

```bash
node --input-type=module --no-warnings -e "
import { getDb } from './src/lib/db.ts';
const db = getDb();
const { total, withImage } = db.prepare(\"SELECT COUNT(*) total, COUNT(image_url) withImage FROM items\").get();
console.log({ total, withImage });
console.table(db.prepare('SELECT substr(title,1,40) title, image_url FROM items WHERE image_url IS NOT NULL LIMIT 5').all());
"
```

Expected: `withImage` is greater than zero (feeds with images are common; GitHub, arXiv and HN carry none, which Task 13 covers), and every listed `image_url` starts with `http`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/sources/util.ts src/lib/sources/kinds/feed.ts src/lib/sources/kinds/reddit.ts src/lib/ingest.ts
git commit -m "feat: capture item images at ingest"
```

---

### Task 13: `og:image` for the items that survived curation

**Files:**
- Create: `src/lib/images.ts`
- Modify: `src/lib/agents/curator.ts:96-99`
- Modify: `src/lib/pipeline.ts:48`

Doing this for everything ingested would be roughly two hundred page fetches a week for items that will mostly be rejected. Doing it for what curation selected is about ten.

- [ ] **Step 1: Write the pass**

Create `src/lib/images.ts`:

```ts
import { getDb } from "./db";
import { parseOg } from "./og";
import { fetchText } from "./sources/util";

/**
 * Fills in the image of the signals that survived curation by reading their
 * `og:image`. GitHub, arXiv and Hacker News carry no image in their payload,
 * so this is the only way those ever get one.
 *
 * Deliberately limited to the selected items — about ten pages a week instead
 * of every item ingested — and never fatal: an item with no image is normal.
 */
export async function fillSelectedImages(week: string, limit = 20): Promise<number> {
  const db = getDb();
  const items = db
    .prepare(
      `SELECT id, url FROM items
       WHERE week_key = ? AND status = 'selected' AND (image_url IS NULL OR image_url = '')
       LIMIT ?`,
    )
    .all(week, limit) as { id: number; url: string }[];
  if (!items.length) return 0;

  const results = await Promise.allSettled(
    items.map(async (item) => ({
      id: item.id,
      image: parseOg(await fetchText(item.url, 8000), item.url).image,
    })),
  );

  const update = db.prepare("UPDATE items SET image_url = ? WHERE id = ?");
  let filled = 0;
  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value.image) continue;
    update.run(r.value.image, r.value.id);
    filled += 1;
  }
  return filled;
}
```

- [ ] **Step 2: Run it at the end of curation**

In `src/lib/agents/curator.ts`, add the import:

```ts
import { fillSelectedImages } from "../images";
```

`curateWeek` returns from two places and both shapes have to match, or `r.images`
in the run log is a type error. Update the early return (line 41) first:

```ts
  if (!items.length) return { scored: 0, selected: 0, images: 0, model: modelLabel() };
```

Then replace the final return (line 99) with:

```ts
  // Last, over the ten or so items that were actually selected.
  const images = await fillSelectedImages(week);

  return { scored: verdicts.length, selected: top.length, images, model: modelLabel() };
```

- [ ] **Step 3: Say so in the run log**

In `src/lib/pipeline.ts`, line 48:

```ts
      log.push(`Curation: ${r.scored} scored, ${r.selected} selected, ${r.images} images found.`);
```

- [ ] **Step 4: Verify the build**

Run: `npm run check`
Expected: clean.

- [ ] **Step 5: Verify it runs and does not break the stage**

Run the curate stage from the sidebar. Expected: the run log line reads `Curation: N scored, M selected, K images found.` and the run finishes `ok` even when some pages time out.

```bash
node --input-type=module --no-warnings -e "
import { getDb } from './src/lib/db.ts';
console.table(getDb().prepare(\"SELECT substr(title,1,40) title, image_url FROM items WHERE status = 'selected'\").all());
"
```

Expected: most selected rows have an `image_url`; the ones that do not are pages with no `og:image`, which is fine.

- [ ] **Step 6: Commit**

```bash
git add src/lib/images.ts src/lib/agents/curator.ts src/lib/pipeline.ts
git commit -m "feat: og:image pass over the selected signals"
```

---

### Task 14: The writer returns a link, an alt text and a verdict on the image

**Files:**
- Modify: `src/lib/prompts.ts` (the `writer` template only)
- Modify: `src/lib/agents/writer.ts:8-15,43-46,55-92`

An LLM cannot produce an image; it can only pick one out of the material it was given, or decline it. So the writer receives each signal's image and answers three new optional fields.

**The `{{language}}` variable is not touched.** The shipped `writer` template's *return shape* does change, and a user who has customised their writer prompt keeps the old shape — which still works, because all three fields are optional and every one has a fallback.

- [ ] **Step 1: Extend the shipped writer template**

In `src/lib/prompts.ts`, in the `writer` definition, replace the `SIGNALS WITH THEIR ANGLE` line and everything after it with:

```
SIGNALS WITH THEIR ANGLE
Each signal carries the image of its source page in "image", when it has one.
{{signals}}

CHANNEL: {{channel_label}}
Format: {{channel_hint}}
Character limit: {{channel_limit}}

TASK
Write {{count}} different publications for {{channel_label}}.
Each one takes a DIFFERENT signal and a DIFFERENT angle. At least one must take a position that is not the consensus.
Write them in this language: {{language}}.
Set "use_source_image" to false when that signal's image adds nothing to the post. Never invent an image: the only one available is the one the signal carries.

Return ONLY this JSON:
[{"item_index":0,"angle":"the thesis of the post","hook":"the first line","body":"the full post","hashtags":["#tag"],"visual_brief":"only if the channel is visual: one line per slide","link":"the URL of the signal this post is built on","image_alt":"one line describing that signal's image, empty if there is none","use_source_image":true}]
```

- [ ] **Step 2: Extend the draft type**

In `src/lib/agents/writer.ts`, replace the `Draft` type (lines 8-15) with:

```ts
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
```

- [ ] **Step 3: Give the writer the images**

In the `signals` payload (line 65), add the image:

```ts
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
```

- [ ] **Step 4: Store the link, the image and the alt text**

Replace the `insert` statement with its final form:

```ts
  const insert = db.prepare(
    `INSERT INTO posts (digest_id, item_id, platform, angle, hook, body, hashtags, visual_brief, char_count, model, status, language, link, image_url, image_alt)
     VALUES (@digest_id, @item_id, @platform, @angle, @hook, @body, @hashtags, @visual_brief, @char_count, @model, 'draft', @language, @link, @image_url, @image_alt)`,
  );
```

Replace the body of the draft loop (lines 75-91) with:

```ts
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
```

- [ ] **Step 5: Verify the build**

Run: `npm run check`
Expected: clean.

- [ ] **Step 6: Verify what the writer stored**

Run the writing stage with a model configured, then:

```bash
node --input-type=module --no-warnings -e "
import { getDb } from './src/lib/db.ts';
console.table(getDb().prepare('SELECT id, platform, language, link, image_url, substr(image_alt,1,40) image_alt FROM posts ORDER BY id DESC LIMIT 6').all());
"
```

Expected: every new row has a `link` (the signal's URL at worst) and the rows built on a signal that had an image carry that `image_url`. A row where the writer answered `use_source_image: false` has `image_url` and `image_alt` both null — that is the intended outcome, not a failure.

- [ ] **Step 7: Commit**

```bash
git add src/lib/prompts.ts src/lib/agents/writer.ts
git commit -m "feat: the writer picks a link and rules on the source image"
```

---

### Task 15: The link of a post, and unfurling it

**Files:**
- Modify: `src/lib/actions.ts:43-66,105-115`

`posts.link` defaults to the signal's URL, in which case `items` already holds the title and the image. Paste a different URL and it has to be resolved once — never during a render.

- [ ] **Step 1: Extend `actionUpdatePost` with the image fields**

Replace `actionUpdatePost` (lines 43-66) with:

```ts
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
```

- [ ] **Step 2: Add the link actions**

Add the imports at the top of `src/lib/actions.ts`:

```ts
import { parseOg } from "./og";
import { fetchText } from "./sources/util";
```

And after `actionUpdatePost`:

```ts
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
```

- [ ] **Step 3: Publish the post's own link, not only the source's**

In `actionPublishPost`, replace the `publisher.publish` call's link arguments (lines 112-119) so the post's own link wins:

```ts
    // The post's own link when it has one, the source signal's otherwise.
    const link = post.link ?? source?.url ?? null;

    const { url } = await publisher.publish({
      channel,
      post,
      rendered: renderPost(post, channel, { link, title: post.link_title ?? source?.title }),
      link,
      secret: channel.credential_id ? readSecret(channel.credential_id) : null,
      config: channelConfig(channel),
    });
```

- [ ] **Step 4: Verify the build**

Run: `npm run check`
Expected: clean.

- [ ] **Step 5: Verify the unfurl**

```bash
node --input-type=module --no-warnings -e "
import { getDb } from './src/lib/db.ts';
const id = getDb().prepare('SELECT id FROM posts ORDER BY id DESC LIMIT 1').get()?.id;
getDb().prepare(\"UPDATE posts SET link = 'https://github.com/Wcamaly/signal', link_title = NULL, link_image = NULL WHERE id = ?\").run(id);
console.log('post', id, 'link set');
"
```

Then, from the browser with the dev server running, trigger the unfurl through the UI added in Task 20 — or, before that UI exists, confirm the parser end of it directly:

```bash
node --input-type=module --no-warnings -e "
import { parseOg } from './src/lib/og.ts';
const url = 'https://github.com/Wcamaly/signal';
const html = await (await fetch(url, { headers: { 'user-agent': 'SignalBot/1.0' } })).text();
console.log(parseOg(html, url));
"
```

Expected: an object whose `title` mentions the repository and whose `image` is an absolute `https://` URL on `opengraph.githubassets.com`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions.ts
git commit -m "feat: post link, unfurl and image fields"
```

---

# Part 3 — The media store

Spec §9 step 3. Files live next to `signal.db`, so the backup advice in the README stays true with no change.

### Task 16: `DATA_DIR/media/`

**Files:**
- Create: `src/lib/media.ts`

- [ ] **Step 1: Write it**

```ts
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./db";

/** Next to signal.db, so backing up the data directory still backs up everything. */
export const MEDIA_DIR = path.join(DATA_DIR, "media");

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** What an upload is allowed to be. Anything else is refused before a byte is written. */
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function extensionFor(contentType: string): string | null {
  return TYPES[contentType.split(";")[0].trim().toLowerCase()] ?? null;
}

export function contentTypeFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return Object.entries(TYPES).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
}

/**
 * Writes an upload and returns the URL that serves it. The name is a hash of
 * the content, so uploading the same image twice does not produce two files —
 * and so the served bytes can be cached forever.
 */
export function saveMedia(bytes: Buffer, contentType: string): string {
  const ext = extensionFor(contentType);
  if (!ext) throw new Error(`Unsupported image type "${contentType}". Use JPEG, PNG, WebP or GIF.`);
  if (!bytes.byteLength) throw new Error("The file is empty");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error("The image is larger than 8 MB");

  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const name = `${crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 32)}.${ext}`;
  const file = path.join(MEDIA_DIR, name);
  if (!fs.existsSync(file)) fs.writeFileSync(file, bytes);
  return `/media/${name}`;
}

/**
 * Resolves a requested name against the directory listing and refuses anything
 * that is not in it. Nothing from the request is ever joined into a path before
 * it has been proved to be a name the directory already contains.
 */
export function readMedia(name: string): { bytes: Buffer; contentType: string } | null {
  if (!fs.existsSync(MEDIA_DIR)) return null;
  if (!fs.readdirSync(MEDIA_DIR).includes(name)) return null;
  return {
    bytes: fs.readFileSync(path.join(MEDIA_DIR, name)),
    contentType: contentTypeFor(name),
  };
}
```

- [ ] **Step 2: Verify the store, the dedupe and the traversal refusal**

```bash
node --input-type=module --no-warnings -e "
import { saveMedia, readMedia, MEDIA_DIR, extensionFor } from './src/lib/media.ts';

// A one-pixel PNG.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const a = saveMedia(png, 'image/png');
const b = saveMedia(png, 'image/png');
console.log('same name twice:', a === b, a);

const read = readMedia(a.replace('/media/', ''));
console.log('read back:', read?.bytes.length === png.length, read?.contentType);

console.log('traversal:', readMedia('../signal.db'));
console.log('unknown name:', readMedia('nope.png'));
console.log('bad type:', extensionFor('image/svg+xml'));
try { saveMedia(png, 'image/svg+xml'); } catch (e) { console.log('refused:', e.message); }
console.log('dir:', MEDIA_DIR);
"
```

Expected:
```
same name twice: true /media/<32 hex chars>.png
read back: true image/png
traversal: null
unknown name: null
bad type: null
refused: Unsupported image type "image/svg+xml". Use JPEG, PNG, WebP or GIF.
dir: /srv/projects/owns/signal/data/media
```

Clean up the test file: `rm -f data/media/*.png` — or leave it, Task 17 needs something to serve.

- [ ] **Step 3: Verify the build**

Run: `npm run check`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/media.ts
git commit -m "feat: media store under the data directory"
```

---

### Task 17: The route that serves an image

**Files:**
- Create: `src/app/media/[name]/route.ts`

Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` first: **`params` is a promise in this version**.

- [ ] **Step 1: Write the handler**

```ts
import { readMedia } from "@/lib/media";

export const dynamic = "force-dynamic";

/**
 * Serves an uploaded image. The name is resolved against the directory listing
 * in lib/media.ts, never concatenated into a path, so `..` and absolute paths
 * simply do not match anything.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const file = readMedia(name);
  if (!file) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "content-type": file.contentType,
      // The name is a hash of the bytes, so they can never change under it.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run check`
Expected: clean.

- [ ] **Step 3: Verify it serves and refuses**

With `npm run dev` running and the test image from Task 16 still in `data/media/`:

```bash
NAME=$(ls data/media | head -1)
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' "http://localhost:3000/media/$NAME"
curl -sS -o /dev/null -w '%{http_code}\n' "http://localhost:3000/media/nope.png"
curl -sS -o /dev/null -w '%{http_code}\n' --path-as-is "http://localhost:3000/media/..%2Fsignal.db"
```

Expected: `200 image/png`, then `404`, then `404` — the database is never served.

- [ ] **Step 4: Commit**

```bash
git add src/app/media
git commit -m "feat: route handler for stored images"
```

---

### Task 18: Uploading

**Files:**
- Modify: `src/lib/actions.ts`

Read `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`: a server action takes `FormData` directly, and its contents are untrusted.

- [ ] **Step 1: Add the action**

Add the import:

```ts
import { MAX_UPLOAD_BYTES, saveMedia } from "./media";
```

And, after the post actions:

```ts
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
```

The size is checked twice on purpose: `file.size` avoids reading eight megabytes into memory before refusing, and `saveMedia` refuses again for any other caller.

- [ ] **Step 2: Verify the build**

Run: `npm run check`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions.ts
git commit -m "feat: image upload action"
```

---

# Part 4 — The card split

Spec §9 step 4. `PostCard.tsx` is 330 lines before this and gains an image control, a link editor and a preview. Split it first, along the seams the new work creates, so the preview lands in a file that is already the right size.

### Task 19: `PostEditor`

**Files:**
- Create: `src/components/PostEditor.tsx`
- Modify: `src/components/PostCard.tsx:139-179`

- [ ] **Step 1: Write the component**

Create `src/components/PostEditor.tsx`:

```tsx
"use client";

/** The body of a post and the two buttons that go with it. Nothing else. */
export default function PostEditor({
  value,
  onChange,
  onSave,
  onDiscard,
  dirty,
  pending,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onDiscard: () => void;
  dirty: boolean;
  pending: boolean;
}) {
  return (
    <>
      <textarea
        className="textarea min-h-[260px] font-sans"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex gap-2 mt-3">
        <button className="btn btn-primary btn-sm" onClick={onSave} disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onDiscard} disabled={pending || !dirty}>
          Discard changes
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Use it in the card**

In `src/components/PostCard.tsx`, add the import:

```tsx
import PostEditor from "./PostEditor";
```

Replace the `editing ? (…) : isThread ? (…) : (…)` block (lines 140-179) with the editor plus the read-only rendering, keeping the existing `editing` toggle for now — the tabs arrive in Task 25:

```tsx
        {editing ? (
          <PostEditor
            value={body}
            onChange={setBody}
            onSave={save}
            onDiscard={() => {
              setBody(post.body);
              setEditing(false);
            }}
            dirty={body !== post.body}
            pending={pending}
          />
        ) : isThread ? (
          <div className="flex flex-col gap-2">
            {tweets.map((t, i) => (
              <div key={i} className="flex gap-3">
                <span className="font-mono text-[11px] text-faint pt-0.5 shrink-0">{i + 1}/</span>
                <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap flex-1">{t}</p>
                <span
                  className="font-mono text-[10.5px] pt-1 shrink-0"
                  style={{ color: t.length > channel.char_limit ? "var(--bad)" : "var(--faint)" }}
                >
                  {t.length}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap">{body}</p>
        )}
```

- [ ] **Step 3: Verify the build**

Run: `npm run check`
Expected: clean.

- [ ] **Step 4: Verify nothing changed**

Run: `npm run dev`, open `/posts`, press **Edit** on a card, change the text, press **Save**; then edit again and press **Discard changes**.
Expected: exactly the behaviour before the split. **Discard changes** is disabled until the text actually differs, which is the only visible difference.

- [ ] **Step 5: Commit**

```bash
git add src/components/PostEditor.tsx src/components/PostCard.tsx
git commit -m "refactor: extract PostEditor from PostCard"
```

---

### Task 20: `PostMedia` — the image and the link

**Files:**
- Create: `src/components/PostMedia.tsx`
- Modify: `src/components/PostCard.tsx`
- Modify: `src/app/posts/page.tsx:44-48`

- [ ] **Step 1: Write the component**

Create `src/components/PostMedia.tsx`:

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  actionSetPostLink,
  actionUnfurlPostLink,
  actionUpdatePost,
  actionUploadImage,
} from "@/lib/actions";
import type { Post } from "@/lib/types";

/**
 * The image and the link of a post. The image is either the one the source
 * carried, one you upload, or a URL you paste; the link card is resolved once
 * and cached, never fetched while rendering.
 */
export default function PostMedia({
  post,
  sourceImage,
}: {
  post: Post;
  /** The image of the signal this post came from, offered as a one-click restore. */
  sourceImage: string | null;
}) {
  const [image, setImage] = useState(post.image_url ?? "");
  const [alt, setAlt] = useState(post.image_alt ?? "");
  const [link, setLink] = useState(post.link ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const isStored = image.startsWith("/media/");

  function saveImage(url: string, altText: string) {
    setError(null);
    start(async () => {
      await actionUpdatePost(post.id, { image_url: url || null, image_alt: altText || null });
      router.refresh();
    });
  }

  function upload(file: File) {
    setError(null);
    start(async () => {
      const form = new FormData();
      form.set("file", file);
      const res = await actionUploadImage(form);
      if (!res.ok || !res.url) {
        setError(res.error ?? "Could not store the image");
        return;
      }
      setImage(res.url);
      await actionUpdatePost(post.id, { image_url: res.url, image_alt: alt || null });
      router.refresh();
    });
  }

  function saveLink() {
    setError(null);
    start(async () => {
      const saved = await actionSetPostLink(post.id, link);
      if (!saved.ok) {
        setError(saved.error ?? "Error");
        return;
      }
      if (link.trim()) {
        const card = await actionUnfurlPostLink(post.id);
        // A link that cannot be read is still a valid link: the card is what
        // is missing, not the link.
        if (!card.ok) setError(card.error ?? null);
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-4 border-t border-line pt-3.5 flex flex-col gap-3">
      <div>
        <span className="kicker">Image</span>
        <div className="flex gap-2 mt-1.5">
          <input
            className="input font-mono !text-[12px]"
            placeholder="https://… or upload one"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            onBlur={() => {
              if (image !== (post.image_url ?? "")) saveImage(image, alt);
            }}
          />
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = "";
            }}
          />
          <button
            className="btn btn-sm shrink-0"
            onClick={() => fileInput.current?.click()}
            disabled={pending}
          >
            Upload
          </button>
        </div>

        <div className="flex gap-1.5 mt-2 flex-wrap">
          {sourceImage && image !== sourceImage && (
            <button
              className="chip hover:!text-ink hover:!border-line-strong"
              onClick={() => {
                setImage(sourceImage);
                saveImage(sourceImage, alt);
              }}
              disabled={pending}
            >
              Use the source image
            </button>
          )}
          {image &&
            (isStored ? (
              <a className="chip hover:!text-ink hover:!border-line-strong" href={image} download>
                Download image
              </a>
            ) : (
              // A cross-origin file cannot be forced to download from here, so
              // this opens it and the browser does the saving.
              <a
                className="chip hover:!text-ink hover:!border-line-strong"
                href={image}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open image ↗
              </a>
            ))}
          {image && (
            <button
              className="chip hover:!text-ink hover:!border-line-strong"
              onClick={() => {
                setImage("");
                setAlt("");
                saveImage("", "");
              }}
              disabled={pending}
            >
              Remove
            </button>
          )}
        </div>

        {image && (
          <input
            className="input !text-[12px] mt-2"
            placeholder="Alt text — one line describing the image"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            onBlur={() => {
              if (alt !== (post.image_alt ?? "")) saveImage(image, alt);
            }}
          />
        )}
      </div>

      <div>
        <span className="kicker">Link</span>
        <div className="flex gap-2 mt-1.5">
          <input
            className="input font-mono !text-[12px]"
            placeholder="https://…"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
          <button
            className="btn btn-sm shrink-0"
            onClick={saveLink}
            disabled={pending || link === (post.link ?? "")}
          >
            {pending ? "…" : "Save & fetch card"}
          </button>
        </div>
        {post.link_title && (
          <p className="text-[11.5px] text-faint mt-1.5 truncate">
            Card: {post.link_title}
            {post.link_image ? " · with image" : ""}
          </p>
        )}
      </div>

      {error && (
        <p className="text-[12px]" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Pass the source image down**

In `src/app/posts/page.tsx`, add the column to the query (line 44):

```tsx
      `SELECT p.*, i.url AS source_url, i.title AS source_title, i.image_url AS source_image
       FROM posts p LEFT JOIN items i ON i.id = p.item_id
       WHERE ${where.join(" AND ")} ORDER BY p.updated_at DESC, p.id DESC`,
```

And widen the row type on line 48:

```tsx
    .all(...args) as (Post & {
    source_url: string | null;
    source_title: string | null;
    source_image: string | null;
  })[];
```

- [ ] **Step 3: Render it in the card**

In `src/components/PostCard.tsx`, add the import:

```tsx
import PostMedia from "./PostMedia";
```

Widen the `post` prop type:

```tsx
  post: Post & {
    source_url?: string | null;
    source_title?: string | null;
    source_image?: string | null;
  };
```

And render it after the visual brief block (line 198), before the template block:

```tsx
        <PostMedia post={post} sourceImage={post.source_image ?? null} />
```

- [ ] **Step 4: Verify the build**

Run: `npm run check`
Expected: clean.

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`, open `/posts`.
Expected, on one card:
- The image field is pre-filled for posts whose signal carried an image.
- **Upload** opens the file picker; picking a JPEG or PNG replaces the field with `/media/<hash>.<ext>` and the file appears under `data/media/`.
- Uploading something that is not an image (a `.txt` renamed to `.png` will do) shows `Unsupported image type "…"` and writes nothing.
- **Remove** clears both the URL and the alt text.
- **Download image** saves the file when it is a `/media/` one; a remote image shows **Open image ↗** instead.
- Pasting a URL into **Link** and pressing **Save & fetch card** shows `Card: <the page title> · with image` underneath.

Confirm it persisted:

```bash
node --input-type=module --no-warnings -e "
import { getDb } from './src/lib/db.ts';
console.table(getDb().prepare('SELECT id, image_url, image_alt, link, link_title, link_image FROM posts ORDER BY updated_at DESC LIMIT 3').all());
"
```

- [ ] **Step 6: Commit**

```bash
git add src/components/PostMedia.tsx src/components/PostCard.tsx src/app/posts/page.tsx
git commit -m "feat: image and link controls on a post"
```

---

# Part 5 — The skins

Spec §9 step 5, and spec §5: a fifth extension point shaped like the four that already exist. A channel is an ordinary database row that anyone can invent from the UI, so the generic fallback is not a nicety — it is what makes the registry safe.

Two rules hold for every skin:

1. **`text` is the channel template's output**, not the raw body — the same string the Copy button puts on the clipboard. A preview of anything else would lie.
2. **Each skin carries its own theme.** A faithful LinkedIn preview is white even though Signal is black, so colours are inline styles, not the application's tokens. `globals.css` sets `* { border-color: var(--border) }`, so every border inside a skin states its own colour.

### Task 21: The registry, the shared props and the generic skin

**Files:**
- Create: `src/components/previews/types.ts`
- Create: `src/components/previews/Avatar.tsx`
- Create: `src/components/previews/generic.tsx`
- Create: `src/components/previews/index.ts`

- [ ] **Step 1: The shared props and helpers**

Create `src/components/previews/types.ts`:

```ts
import type { ReactElement } from "react";

/** Everything a skin gets. Identical for all of them, on purpose. */
export type PreviewProps = {
  author: string;
  avatar: string | null;
  handle: string | null;
  /** The channel colour, used when there is no avatar. */
  color: string;
  /** The channel template's output — the string the Copy button gives you. */
  text: string;
  /**
   * Usually already inside `text`, because most channel templates end with
   * `{{hashtags}}`. Here for a skin that wants to draw them differently — such
   * a skin must not render `text` and these both, or they appear twice.
   */
  hashtags: string[];
  image: string | null;
  imageAlt: string | null;
  link: string | null;
  linkCard: { title: string; image: string | null } | null;
  charLimit: number;
};

/**
 * A preview skin is the fifth plugin unit: one file, plus one line in
 * previews/index.ts. A channel with no skin falls back to the generic one, so
 * nothing has to be registered for an invented channel to work.
 */
export type PreviewSkin = {
  /** The channel key this skin is for. */
  key: string;
  label: string;
  Component: (props: PreviewProps) => ReactElement;
};

/** Two initials, for when there is no avatar. */
export function initials(author: string): string {
  const parts = author.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Splits the text at the platform's fold, on a word boundary the way the real
 * clients do. Every limit passed in here is an observed value, not a
 * documented one — the platforms change them without notice.
 */
export function cut(text: string, limit: number): { shown: string; hidden: boolean } {
  if (text.length <= limit) return { shown: text, hidden: false };
  const slice = text.slice(0, limit);
  const space = slice.lastIndexOf(" ");
  return { shown: slice.slice(0, space > limit * 0.6 ? space : limit).trimEnd(), hidden: true };
}
```

- [ ] **Step 2: The avatar**

Create `src/components/previews/Avatar.tsx`:

```tsx
import { initials } from "./types";

/** The author's picture, or their initials on the channel colour. */
export default function Avatar({
  src,
  name,
  color,
  size = 40,
  radius = "9999px",
}: {
  src: string | null;
  name: string;
  color: string;
  size?: number;
  radius?: string;
}) {
  const box = { width: size, height: size, borderRadius: radius, flexShrink: 0 } as const;

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a preview renders whatever URL the post carries; next/image would need every host allow-listed
      <img src={src} alt="" style={{ ...box, objectFit: "cover", display: "block" }} />
    );
  }

  return (
    <div
      style={{
        ...box,
        background: color,
        color: "#0a0b0d",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.38),
        fontWeight: 700,
        letterSpacing: "0.02em",
      }}
    >
      {initials(name)}
    </div>
  );
}
```

- [ ] **Step 3: The generic skin**

Create `src/components/previews/generic.tsx`:

```tsx
import Avatar from "./Avatar";
import { hostOf, type PreviewProps, type PreviewSkin } from "./types";

/**
 * The fallback. Any channel can be invented from the UI, so this has to work
 * for a network nobody has written a skin for: the author, the text, the image
 * and the link, with the character limit as the only platform-specific fact.
 */
function Generic({
  author,
  avatar,
  handle,
  color,
  text,
  image,
  imageAlt,
  link,
  linkCard,
  charLimit,
}: PreviewProps) {
  const over = text.length > charLimit;

  return (
    <div
      style={{
        background: "#15171b",
        color: "#e9eaec",
        border: "1px solid #2b3037",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", gap: 10, padding: 14 }}>
        <Avatar src={avatar} name={author} color={color} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{author || "Your name"}</div>
          {handle && <div style={{ fontSize: 12.5, color: "#8b929c" }}>{handle}</div>}
        </div>
        <span
          style={{
            fontSize: 11,
            fontFamily: "ui-monospace, monospace",
            color: over ? "#c9564f" : "#5f666f",
          }}
        >
          {text.length}/{charLimit}
        </span>
      </div>

      <div
        style={{
          padding: "0 14px 14px",
          fontSize: 14,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
        }}
      >
        {text}
      </div>

      {image && (
        // eslint-disable-next-line @next/next/no-img-element -- see Avatar
        <img
          src={image}
          alt={imageAlt ?? ""}
          style={{ width: "100%", display: "block", objectFit: "cover", maxHeight: 420 }}
        />
      )}

      {!image && linkCard && (
        <div style={{ borderTop: "1px solid #2b3037", padding: "10px 14px" }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{linkCard.title}</div>
          {link && <div style={{ fontSize: 12, color: "#8b929c" }}>{hostOf(link)}</div>}
        </div>
      )}
    </div>
  );
}

const generic: PreviewSkin = { key: "generic", label: "Generic", Component: Generic };
export default generic;
```

- [ ] **Step 4: The registry**

Create `src/components/previews/index.ts`:

```ts
import generic from "./generic";
import type { PreviewSkin } from "./types";

/**
 * The fifth extension point. Write a skin, add it here, and any channel whose
 * key matches gets it. Everything else falls back to the generic one.
 */
export const PREVIEW_SKINS: PreviewSkin[] = [];

export function getPreviewSkin(channelKey: string): PreviewSkin {
  return PREVIEW_SKINS.find((s) => s.key === channelKey) ?? generic;
}

export type { PreviewProps, PreviewSkin } from "./types";
```

- [ ] **Step 5: Verify the helpers**

```bash
node --input-type=module --no-warnings -e "
import { cut, initials, hostOf } from './src/components/previews/types.ts';
console.log(cut('short text', 100));
console.log(cut('one two three four five six seven eight nine ten', 20));
console.log(cut('abcdefghijklmnopqrstuvwxyz', 10));
console.log(initials('Walter Camaly'), '|', initials('Prince'), '|', initials('   '));
console.log(hostOf('https://www.example.com/a/b'), hostOf('not a url'));
"
```

Expected:
```
{ shown: 'short text', hidden: false }
{ shown: 'one two three four', hidden: true }
{ shown: 'abcdefghij', hidden: true }
WC | P |  ?
example.com not a url
```

(The third case has no space past 60% of the limit, so it cuts mid-word — which is what a client does with a long unbroken string.)

- [ ] **Step 6: Verify the build**

Run: `npm run check`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/previews
git commit -m "feat: preview skin registry with a generic fallback"
```

---

### Task 22: The LinkedIn skin

**Files:**
- Create: `src/components/previews/linkedin.tsx`
- Modify: `src/components/previews/index.ts`

- [ ] **Step 1: Write it**

```tsx
import Avatar from "./Avatar";
import { cut, hostOf, type PreviewProps, type PreviewSkin } from "./types";

// Observed values. LinkedIn changes them without notice, so treat the fold as
// an approximation of where "…see more" appears, not a guarantee.
const FOLD = 210;
const IMAGE_RATIO = "1.91 / 1";

const INK = "#000000e6";
const DIM = "#00000099";
const LINE = "#e0dfdc";

function LinkedIn({ author, avatar, handle, color, text, image, imageAlt, link, linkCard }: PreviewProps) {
  const { shown, hidden } = cut(text, FOLD);

  return (
    <div
      style={{
        background: "#ffffff",
        color: INK,
        border: `1px solid ${LINE}`,
        borderRadius: 8,
        overflow: "hidden",
        fontFamily: '-apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ display: "flex", gap: 8, padding: 12 }}>
        <Avatar src={avatar} name={author} color={color} size={48} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>
            {author || "Your name"}
          </div>
          <div style={{ fontSize: 12, color: DIM, lineHeight: 1.4 }}>
            {handle || "Your headline"}
          </div>
          <div style={{ fontSize: 12, color: DIM }}>now · 🌐</div>
        </div>
      </div>

      <div
        style={{
          padding: "0 12px 12px",
          fontSize: 14,
          lineHeight: 1.43,
          whiteSpace: "pre-wrap",
        }}
      >
        {shown}
        {hidden && <span style={{ color: DIM }}>… see more</span>}
      </div>

      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- see Avatar
        <img
          src={image}
          alt={imageAlt ?? ""}
          style={{ width: "100%", aspectRatio: IMAGE_RATIO, objectFit: "cover", display: "block" }}
        />
      ) : linkCard ? (
        <div style={{ background: "#f4f2ee", borderTop: `1px solid ${LINE}` }}>
          {linkCard.image && (
            // eslint-disable-next-line @next/next/no-img-element -- see Avatar
            <img
              src={linkCard.image}
              alt=""
              style={{ width: "100%", aspectRatio: IMAGE_RATIO, objectFit: "cover", display: "block" }}
            />
          )}
          <div style={{ padding: "10px 12px" }}>
            <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{linkCard.title}</div>
            {link && <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{hostOf(link)}</div>}
          </div>
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          gap: 18,
          padding: "8px 12px",
          borderTop: `1px solid ${LINE}`,
          fontSize: 13,
          fontWeight: 600,
          color: DIM,
        }}
      >
        <span>👍 Like</span>
        <span>💬 Comment</span>
        <span>↻ Repost</span>
        <span>➦ Send</span>
      </div>
    </div>
  );
}

const linkedin: PreviewSkin = { key: "linkedin", label: "LinkedIn", Component: LinkedIn };
export default linkedin;
```

- [ ] **Step 2: Register it**

In `src/components/previews/index.ts`:

```ts
import generic from "./generic";
import linkedin from "./linkedin";
import type { PreviewSkin } from "./types";
```

```ts
export const PREVIEW_SKINS: PreviewSkin[] = [linkedin];
```

- [ ] **Step 3: Verify the build**

Run: `npm run check`
Expected: clean. (It is not visible yet — Task 25 wires the preview into the card.)

- [ ] **Step 4: Commit**

```bash
git add src/components/previews
git commit -m "feat: LinkedIn preview skin"
```

---

### Task 23: The X skin

**Files:**
- Create: `src/components/previews/x.tsx`
- Modify: `src/components/previews/index.ts`

- [ ] **Step 1: Write it**

```tsx
import Avatar from "./Avatar";
import { hostOf, type PreviewProps, type PreviewSkin } from "./types";

// The channel hint tells the writer to separate the posts of a thread with a
// line containing exactly ---, which is what this splits on.
const SPLIT = "\n---\n";
// Observed value: the free tier's limit per post.
const PER_POST = 280;

const INK = "#e7e9ea";
const DIM = "#71767b";
const LINE = "#2f3336";

function X({ author, avatar, handle, color, text, image, imageAlt, link, linkCard }: PreviewProps) {
  const posts = text.split(SPLIT).map((t) => t.trim()).filter(Boolean);

  return (
    <div
      style={{
        background: "#000000",
        color: INK,
        border: `1px solid ${LINE}`,
        borderRadius: 12,
        overflow: "hidden",
        fontFamily: '-apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {posts.map((post, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: 10,
            padding: 12,
            borderTop: i ? `1px solid ${LINE}` : undefined,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <Avatar src={avatar} name={author} color={color} size={40} />
            {i < posts.length - 1 && (
              <div style={{ width: 2, flex: 1, background: LINE, marginTop: 4 }} />
            )}
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", gap: 5, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{author || "Your name"}</span>
              <span style={{ fontSize: 15, color: DIM }}>{handle || "@you"} · now</span>
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 11,
                  fontFamily: "ui-monospace, monospace",
                  color: post.length > PER_POST ? "#f4212e" : DIM,
                }}
              >
                {post.length}/{PER_POST}
              </span>
            </div>

            <div style={{ fontSize: 15, lineHeight: 1.35, whiteSpace: "pre-wrap", marginTop: 2 }}>
              {post}
            </div>

            {i === 0 && image && (
              // eslint-disable-next-line @next/next/no-img-element -- see Avatar
              <img
                src={image}
                alt={imageAlt ?? ""}
                style={{
                  width: "100%",
                  marginTop: 10,
                  borderRadius: 14,
                  border: `1px solid ${LINE}`,
                  objectFit: "cover",
                  maxHeight: 380,
                  display: "block",
                }}
              />
            )}

            {i === 0 && !image && linkCard && (
              <div style={{ marginTop: 10, border: `1px solid ${LINE}`, borderRadius: 14, overflow: "hidden" }}>
                {linkCard.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- see Avatar
                  <img
                    src={linkCard.image}
                    alt=""
                    style={{ width: "100%", aspectRatio: "1.91 / 1", objectFit: "cover", display: "block" }}
                  />
                )}
                <div style={{ padding: "8px 12px" }}>
                  {link && <div style={{ fontSize: 13, color: DIM }}>{hostOf(link)}</div>}
                  <div style={{ fontSize: 14 }}>{linkCard.title}</div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 26, marginTop: 10, fontSize: 13, color: DIM }}>
              <span>💬</span>
              <span>↻</span>
              <span>♡</span>
              <span>⇪</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const x: PreviewSkin = { key: "x", label: "X", Component: X };
export default x;
```

- [ ] **Step 2: Register it**

```ts
import generic from "./generic";
import linkedin from "./linkedin";
import x from "./x";
import type { PreviewSkin } from "./types";
```

```ts
export const PREVIEW_SKINS: PreviewSkin[] = [linkedin, x];
```

- [ ] **Step 3: Verify the build**

Run: `npm run check`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/previews
git commit -m "feat: X preview skin with thread splitting"
```

---

### Task 24: The Instagram skin

**Files:**
- Create: `src/components/previews/instagram.tsx`
- Modify: `src/components/previews/index.ts`

- [ ] **Step 1: Write it**

```tsx
import Avatar from "./Avatar";
import { cut, type PreviewProps, type PreviewSkin } from "./types";

// Observed value: where the caption collapses behind "… more".
const CAPTION_FOLD = 125;

const INK = "#f5f5f5";
const DIM = "#a8a8a8";
const LINE = "#262626";

function Instagram({ author, avatar, handle, color, text, image, imageAlt }: PreviewProps) {
  const { shown, hidden } = cut(text, CAPTION_FOLD);

  return (
    <div
      style={{
        background: "#000000",
        color: INK,
        border: `1px solid ${LINE}`,
        borderRadius: 8,
        overflow: "hidden",
        fontFamily: '-apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 10 }}>
        <Avatar src={avatar} name={author} color={color} size={32} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {handle?.replace(/^@/, "") || author || "you"}
        </span>
        <span style={{ marginLeft: "auto", color: DIM }}>···</span>
      </div>

      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- see Avatar
        <img
          src={image}
          alt={imageAlt ?? ""}
          style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block" }}
        />
      ) : (
        // Instagram is image-first: a post with no image has no post.
        <div
          style={{
            aspectRatio: "1 / 1",
            background: "#121212",
            borderTop: `1px solid ${LINE}`,
            borderBottom: `1px solid ${LINE}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: DIM,
            fontSize: 12.5,
            textAlign: "center",
            padding: 24,
          }}
        >
          No image yet. Instagram shows the picture first and the caption second —
          add one above and this is what people will see.
        </div>
      )}

      <div style={{ display: "flex", gap: 14, padding: "8px 10px", fontSize: 16 }}>
        <span>♡</span>
        <span>💬</span>
        <span>➦</span>
        <span style={{ marginLeft: "auto" }}>🔖</span>
      </div>

      <div style={{ padding: "0 10px 12px", fontSize: 13, lineHeight: 1.45 }}>
        <span style={{ fontWeight: 600 }}>{handle?.replace(/^@/, "") || author || "you"} </span>
        <span style={{ whiteSpace: "pre-wrap" }}>{shown}</span>
        {hidden && <span style={{ color: DIM }}>… more</span>}
      </div>
    </div>
  );
}

const instagram: PreviewSkin = { key: "instagram", label: "Instagram", Component: Instagram };
export default instagram;
```

The hashtags are **not** rendered separately: Instagram's shipped template is `{{body}}\n\n{{hashtags}}`, so they are already inside `text`. Rendering the `hashtags` prop as well would print them twice — rule 1 again, the skin draws the template's output and nothing else.

- [ ] **Step 2: Register it**

```ts
import generic from "./generic";
import instagram from "./instagram";
import linkedin from "./linkedin";
import x from "./x";
import type { PreviewSkin } from "./types";
```

```ts
export const PREVIEW_SKINS: PreviewSkin[] = [linkedin, x, instagram];
```

- [ ] **Step 3: Verify the build**

Run: `npm run check`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/previews
git commit -m "feat: Instagram preview skin"
```

---

### Task 25: The preview in the queue, and the three tabs

**Files:**
- Create: `src/components/PostPreview.tsx`
- Modify: `src/components/PostCard.tsx` (rewritten in full below)
- Modify: `src/app/posts/page.tsx`
- Modify: `src/components/VoiceForm.tsx`

- [ ] **Step 1: Write `PostPreview`**

Create `src/components/PostPreview.tsx`:

```tsx
"use client";

import { getPreviewSkin } from "./previews";
import type { Channel } from "@/lib/types";

/** Picks the skin for the channel and hands it the props every skin shares. */
export default function PostPreview({
  channel,
  author,
  avatar,
  handle,
  text,
  hashtags,
  image,
  imageAlt,
  link,
  linkCard,
}: {
  channel: Channel;
  author: string;
  avatar: string | null;
  handle: string | null;
  text: string;
  hashtags: string[];
  image: string | null;
  imageAlt: string | null;
  link: string | null;
  linkCard: { title: string; image: string | null } | null;
}) {
  const skin = getPreviewSkin(channel.key);

  return (
    <div>
      <p className="kicker mb-2.5">
        {skin.key === "generic" ? `Generic preview — no skin for "${channel.key}"` : skin.label}
      </p>
      <div className="max-w-[520px]">
        <skin.Component
          author={author}
          avatar={avatar}
          handle={handle}
          color={channel.color}
          text={text}
          hashtags={hashtags}
          image={image}
          imageAlt={imageAlt}
          link={link}
          linkCard={linkCard}
          charLimit={channel.char_limit}
        />
      </div>
      <p className="text-[11px] text-faint mt-2 leading-snug">
        Rendered from the channel template — the same text the Copy button gives you. Where the
        text folds and how it is spaced are approximations: the platforms change both without
        notice.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `PostCard`**

Replace the whole of `src/components/PostCard.tsx` with:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import CopyButton from "./CopyButton";
import PostEditor from "./PostEditor";
import PostLanguage from "./PostLanguage";
import PostMedia from "./PostMedia";
import PostPreview from "./PostPreview";
import {
  actionPublishPost,
  actionRefinePost,
  actionSetPostStatus,
  actionUpdatePost,
} from "@/lib/actions";
import { renderTemplate } from "@/lib/template";
import type { Channel, Post } from "@/lib/types";

const QUICK = [
  "Shorter and sharper",
  "More technical, for someone who deploys this",
  "Change the hook, this one does not land",
  "Drop the sales tone",
  "Take the position against the consensus",
];

const TABS = [
  { key: "edit", label: "Edit" },
  { key: "preview", label: "Preview" },
  { key: "template", label: "Template" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default function PostCard({
  post,
  channel,
  publisherLabel,
  language,
  author,
  avatar,
  handle,
}: {
  post: Post & {
    source_url?: string | null;
    source_title?: string | null;
    source_image?: string | null;
  };
  channel: Channel;
  publisherLabel: string;
  /** Already resolved: the post's own language, or the channel's, or the profile's. */
  language: string;
  author: string;
  avatar: string | null;
  handle: string | null;
}) {
  const [body, setBody] = useState(post.body);
  const [tab, setTab] = useState<Tab>("edit");
  const [refineOpen, setRefineOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const hashtags = (() => {
    try {
      return JSON.parse(post.hashtags ?? "[]") as string[];
    } catch {
      return [];
    }
  })();

  const link = post.link ?? post.source_url ?? null;

  const rendered = renderTemplate(channel.template || "{{body}}", {
    body,
    hook: post.hook ?? "",
    hashtags: hashtags.join(" "),
    angle: post.angle ?? "",
    link: link ?? "",
    title: post.link_title ?? post.source_title ?? "",
  });

  // A link that was unfurled has its own card; a link that is still the source
  // signal's already has one in `items`, fetched at ingest.
  const linkCard = post.link_title
    ? { title: post.link_title, image: post.link_image ?? null }
    : post.source_title && link === post.source_url
      ? { title: post.source_title, image: post.source_image ?? null }
      : null;

  const over = body.length > channel.char_limit;
  const isThread = body.includes("\n---\n");
  const threadLength = isThread ? body.split("\n---\n").filter((t) => t.trim()).length : 0;
  const canPublish = channel.publisher !== "manual";

  function setStatus(s: string, when?: string) {
    start(async () => {
      await actionSetPostStatus(post.id, s, when);
      router.refresh();
    });
  }

  function save() {
    start(async () => {
      await actionUpdatePost(post.id, { body });
      router.refresh();
    });
  }

  function refine(text: string) {
    setError(null);
    start(async () => {
      const res = await actionRefinePost(post.id, text);
      if (!res.ok) setError(res.error ?? "Error");
      else {
        setRefineOpen(false);
        setInstruction("");
        router.refresh();
      }
    });
  }

  function publish() {
    setError(null);
    start(async () => {
      const res = await actionPublishPost(post.id);
      if (!res.ok) setError(res.error ?? "Error");
      router.refresh();
    });
  }

  return (
    <article className="card overflow-hidden">
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-4 border-b border-line">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
            <span className="text-[12px] font-semibold" style={{ color: channel.color }}>
              {channel.label}
            </span>
            {isThread && <span className="chip !text-[10px] !py-0">thread · {threadLength}</span>}
            <span
              className="font-mono text-[11px]"
              style={{ color: over ? "var(--bad)" : "var(--faint)" }}
            >
              {body.length}/{channel.char_limit}
            </span>
            <span className="chip !text-[10px] !py-0">{post.status}</span>
            <PostLanguage postId={post.id} language={language} />
            {post.scheduled_at && (
              <span className="chip !text-[10px] !py-0" style={{ color: "var(--accent)" }}>
                {post.scheduled_at}
              </span>
            )}
            {post.published_url && (
              <a
                href={post.published_url}
                target="_blank"
                rel="noopener noreferrer"
                className="chip !text-[10px] !py-0 hover:!text-ink"
              >
                live ↗
              </a>
            )}
          </div>
          {post.angle && <p className="text-[12px] text-muted leading-snug">{post.angle}</p>}
        </div>
        <div className="shrink-0">
          <CopyButton text={rendered} label="Copy" className="btn btn-sm" />
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="flex gap-1.5 mb-3.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`chip ${tab === t.key ? "!text-ink !border-line-strong !bg-[#1e2228]" : "hover:!text-ink"}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "edit" && (
          <PostEditor
            value={body}
            onChange={setBody}
            onSave={save}
            onDiscard={() => setBody(post.body)}
            dirty={body !== post.body}
            pending={pending}
          />
        )}

        {tab === "preview" && (
          <PostPreview
            channel={channel}
            author={author}
            avatar={avatar}
            handle={handle}
            text={rendered}
            hashtags={hashtags}
            image={post.image_url ?? null}
            imageAlt={post.image_alt ?? null}
            link={link}
            linkCard={linkCard}
          />
        )}

        {tab === "template" && (
          <div>
            <span className="kicker">What gets published ({channel.label} template)</span>
            <pre className="text-[12.5px] text-muted whitespace-pre-wrap leading-relaxed mt-1.5 font-sans bg-[#0e1013] border border-line rounded-md p-3">
              {rendered}
            </pre>
          </div>
        )}

        {!!hashtags.length && (
          <div className="flex flex-wrap gap-1.5 mt-3.5">
            {hashtags.map((h) => (
              <span key={h} className="chip !text-[11px]">
                {h}
              </span>
            ))}
          </div>
        )}

        {post.visual_brief && (
          <div className="mt-4 border-t border-line pt-3.5">
            <span className="kicker">Visual brief</span>
            <pre className="text-[12px] text-muted whitespace-pre-wrap leading-relaxed mt-1.5 font-sans">
              {post.visual_brief}
            </pre>
          </div>
        )}

        <PostMedia post={post} sourceImage={post.source_image ?? null} />

        {post.source_url && (
          <a
            href={post.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11.5px] text-faint hover:text-accent mt-3.5 block truncate"
          >
            Source: {post.source_title}
          </a>
        )}
      </div>

      {refineOpen && (
        <div className="px-5 pb-4">
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {QUICK.map((q) => (
              <button
                key={q}
                className="chip hover:!text-ink hover:!border-line-strong"
                onClick={() => refine(q)}
                disabled={pending}
              >
                {q}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="Or write your own instruction…"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && instruction && refine(instruction)}
            />
            <button
              className="btn btn-sm"
              onClick={() => refine(instruction)}
              disabled={pending || !instruction}
            >
              {pending ? "…" : "Rewrite"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="px-5 pb-3 text-[12px]" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}

      <div className="px-5 py-3 border-t border-line flex items-center gap-2 flex-wrap bg-[#0f1113]">
        <button className="btn btn-sm" onClick={() => setRefineOpen((o) => !o)} disabled={pending}>
          Ask for a rewrite
        </button>
        <div className="flex-1" />
        {post.status !== "published" && (
          <input
            type="datetime-local"
            className="input !w-auto !py-1.5 !text-[12px]"
            defaultValue={post.scheduled_at?.replace(" ", "T").slice(0, 16) ?? ""}
            onChange={(e) =>
              e.target.value && setStatus("scheduled", e.target.value.replace("T", " "))
            }
          />
        )}
        {post.status === "draft" && (
          <button className="btn btn-sm" onClick={() => setStatus("approved")} disabled={pending}>
            Approve
          </button>
        )}
        {post.status !== "published" &&
          (canPublish ? (
            <button className="btn btn-primary btn-sm" onClick={publish} disabled={pending}>
              {pending ? "Publishing…" : `Publish via ${publisherLabel}`}
            </button>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setStatus("published")}
              disabled={pending}
            >
              Mark published
            </button>
          ))}
        {post.status !== "discarded" && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setStatus("discarded")}
            disabled={pending}
          >
            Discard
          </button>
        )}
        {(post.status === "discarded" || post.status === "published") && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setStatus("draft")}
            disabled={pending}
          >
            Back to draft
          </button>
        )}
      </div>
    </article>
  );
}
```

The header **Edit** button and the footer **Template preview** button are gone: the tabs are what replaces both. The thread view that used to render numbered tweets is gone too — the X skin does that job properly, with the real per-post limit.

- [ ] **Step 3: Feed the card the author's identity**

In `src/app/posts/page.tsx`, widen the channels import:

```tsx
import { channelConfig, channelLabel, getChannels } from "@/lib/channels";
```

Inside the `posts.map` callback, after the `language` line, work out the handle and pass everything down:

```tsx
            const config = channelConfig(channel);
            const handle =
              typeof config.handle === "string" && config.handle.trim()
                ? config.handle.trim()
                : null;
            return (
              <PostCard
                key={p.id}
                post={p}
                channel={channel}
                language={language}
                author={voice.author}
                avatar={voice.avatar || null}
                handle={handle}
                publisherLabel={
                  publishers.find((pub) => pub.id === channel.publisher)?.label ?? "Manual"
                }
              />
            );
```

- [ ] **Step 4: Let the author set a picture**

In `src/components/VoiceForm.tsx`, add the imports:

```tsx
import { useRef } from "react";
import { actionUploadImage } from "@/lib/actions";
```

(merge `useRef` into the existing `import { useState, useTransition } from "react";`)

Add a ref next to the other state:

```tsx
  const avatarInput = useRef<HTMLInputElement>(null);
```

And add the field right after the **Company / what you build** field:

```tsx
        <Field
          label="Picture"
          hint="Shown in the previews of the publication queue. Paste a URL or upload a file — nothing is sent anywhere, it is stored next to the database."
        >
          <div className="flex gap-2">
            <input
              className="input font-mono !text-[12px]"
              placeholder="https://… or upload"
              value={v.avatar}
              onChange={(e) => set("avatar", e.target.value)}
            />
            <input
              ref={avatarInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                start(async () => {
                  const form = new FormData();
                  form.set("file", file);
                  const res = await actionUploadImage(form);
                  if (res.ok && res.url) set("avatar", res.url);
                });
              }}
            />
            <button
              type="button"
              className="btn btn-sm shrink-0"
              onClick={() => avatarInput.current?.click()}
              disabled={pending}
            >
              Upload
            </button>
          </div>
        </Field>
```

The upload only fills the field; **Save** is what stores it, like every other setting on this page.

- [ ] **Step 5: Verify the build**

Run: `npm run check`
Expected: clean.

- [ ] **Step 6: Verify every skin**

Run: `npm run dev`, open `/posts`.

Expected:
- Each card has **Edit / Preview / Template** tabs. Edit is the textarea, Template is the old `<pre>`.
- A LinkedIn post's preview is a **white** card inside Signal's black page, with the author's name, the picture (or their initials on the LinkedIn blue), and a "…see more" cut around 210 characters.
- An X post's preview is black, and a body with `\n---\n` in it renders as a connected thread with a per-bubble counter that turns red past 280.
- An Instagram post's preview is square-image-first; with no image it says so.
- Create a channel with an invented key under Settings → Channels, run the writer for it (or change one post's `platform` in the database), and its preview is the generic one, headed `Generic preview — no skin for "<key>"`.
- Typing in the Edit tab and switching to Preview shows the edited text, because the preview renders the template over the live body.

Then compare against reality: copy a real post of yours into a LinkedIn draft and check where the platform actually folds it against where the skin does. Adjust `FOLD` in `linkedin.tsx` if it is off — that constant is documented as an observed value precisely so it can be tuned.

- [ ] **Step 7: Commit**

```bash
git add src/components/PostPreview.tsx src/components/PostCard.tsx src/app/posts/page.tsx src/components/VoiceForm.tsx
git commit -m "feat: network preview in the publication queue"
```

---

# Part 6 — Publishing

Spec §9 step 6. The image travels as far as the webhook payload and the download button; Mastodon and Bluesky stay text-only, because uploading media through their APIs is its own change (spec §10).

### Task 26: The image reaches the webhook

**Files:**
- Modify: `src/lib/publishers/types.ts:3-12`
- Modify: `src/lib/publishers/index.ts:29-43,58-68,81-112`
- Modify: `src/lib/actions.ts` (`actionPublishPost`)

- [ ] **Step 1: Add the image to the publish context**

In `src/lib/publishers/types.ts`:

```ts
export type PublishContext = {
  channel: Channel;
  post: Post;
  /** The post already run through the channel template. */
  rendered: string;
  link: string | null;
  /**
   * The post's image as an absolute URL, whatever the receiver is. An uploaded
   * image is served from this Signal instance, so the origin is resolved from
   * the request before it is handed over.
   */
  imageUrl: string | null;
  /** Decrypted credential for this channel, when it has one. */
  secret: string | null;
  config: Record<string, unknown>;
};
```

- [ ] **Step 2: Resolve the origin and pass it in**

In `src/lib/actions.ts`, add the import:

```ts
import { headers } from "next/headers";
```

Add this helper next to `guard`:

```ts
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
```

In `actionPublishPost`, add the image next to the link:

```ts
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
```

- [ ] **Step 3: Put it in the webhook payload**

In `src/lib/publishers/index.ts`, replace the webhook's payload object (lines 31-41) with:

```ts
      {
        channel: ctx.channel.key,
        post_id: ctx.post.id,
        hook: ctx.post.hook,
        body: ctx.post.body,
        hashtags: ctx.post.hashtags ? JSON.parse(ctx.post.hashtags) : [],
        visual_brief: ctx.post.visual_brief,
        angle: ctx.post.angle,
        language: ctx.post.language,
        link: ctx.link,
        image_url: ctx.imageUrl,
        image_alt: ctx.post.image_alt,
        text: ctx.rendered,
      },
```

- [ ] **Step 4: Say why the other two send text only**

In the `mastodon` publisher, above the `postJson` call:

```ts
    // Text only, on purpose. Attaching the image means uploading it first
    // (POST /api/v2/media) and passing the returned ids as media_ids here.
    // `ctx.imageUrl` already has the image when the post carries one.
```

In the `bluesky` publisher, above the `createRecord` call:

```ts
    // Text only, on purpose. An image would need com.atproto.repo.uploadBlob
    // first and the returned blob reference in `record.embed`. `ctx.imageUrl`
    // already has the image when the post carries one.
```

Update the `bluesky` help string so the UI stops promising less than it delivers — it already says links are plain text; make it say the same about images:

```ts
  help: "Posts through the AT Protocol. Use an app password (Settings → App Passwords), never your account password. Links and images are posted as plain text.",
```

- [ ] **Step 5: Verify the build**

Run: `npm run check`
Expected: clean.

- [ ] **Step 6: Verify the payload**

Start a receiver:

```bash
node --input-type=module --no-warnings -e "
import http from 'node:http';
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => { console.log(JSON.stringify(JSON.parse(body), null, 2)); res.end('{\"url\":null}'); });
}).listen(4999, () => console.log('listening on 4999'));
"
```

Then set a channel's publisher to **Webhook** with the endpoint `http://localhost:4999/`, give one of its posts an uploaded image, and press **Publish via Webhook**.

Expected: the receiver prints a payload whose `image_url` is `http://localhost:3000/media/<hash>.<ext>` — absolute, not `/media/…` — and whose `link`, `language` and `image_alt` are filled in. Fetching that `image_url` returns the image.

- [ ] **Step 7: Commit**

```bash
git add src/lib/publishers src/lib/actions.ts
git commit -m "feat: the image travels to the webhook payload"
```

---

### Task 27: Document the fifth plugin point

**Files:**
- Modify: `README.md:116-127`
- Modify: `docs/extending.md`
- Modify: `docs/configuring.md`

- [ ] **Step 1: README**

Replace the "Extending it" section (lines 116-127) with:

```markdown
## Extending it

Five plugin points, each a single file plus one line in a registry:

| I want to… | Add a… | In |
|---|---|---|
| read from somewhere new | source kind | `src/lib/sources/kinds/` |
| use a different model | LLM provider | `src/lib/llm/providers/` |
| write for another platform | channel | the UI |
| actually deliver a post | publisher | `src/lib/publishers/` |
| see a post as a network draws it | preview skin | `src/components/previews/` |

Walkthroughs with working code: **[docs/extending.md](docs/extending.md)**.
```

- [ ] **Step 2: `docs/extending.md`**

Add this section after "## Add a publisher" and before "## Add a prompt variable":

```markdown
## Add a preview skin

A skin draws a post the way one network draws it. It is pure frontend: it
receives what the agent produced and what the channel template rendered, and
returns markup. Nothing it does costs a token.

Create `src/components/previews/threads.tsx`:

```tsx
import Avatar from "./Avatar";
import { cut, type PreviewProps, type PreviewSkin } from "./types";

// Observed value, not a documented one.
const FOLD = 500;

function Threads({ author, avatar, handle, color, text, image, imageAlt }: PreviewProps) {
  const { shown, hidden } = cut(text, FOLD);
  return (
    <div style={{ background: "#101010", color: "#f3f5f7", border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }}>
      <div style={{ display: "flex", gap: 10 }}>
        <Avatar src={avatar} name={author} color={color} size={36} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{handle || author}</div>
          <div style={{ fontSize: 15, whiteSpace: "pre-wrap" }}>
            {shown}
            {hidden && <span style={{ color: "#999" }}>… more</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

const threads: PreviewSkin = { key: "threads", label: "Threads", Component: Threads };
export default threads;
```

Register it in `src/components/previews/index.ts`:

```ts
import threads from "./threads";

export const PREVIEW_SKINS: PreviewSkin[] = [linkedin, x, instagram, threads];
```

`key` is the channel key. A channel with no skin — and any channel can be
invented from the UI — gets the generic one, so this is never required.

Two rules:

- **The theme is the skin's own.** A LinkedIn preview is white even though
  Signal is black, so use inline styles rather than the application's tokens.
- **`text` is the channel template's output**, not the raw body — the same
  string the Copy button gives you. A preview of anything else would lie.
```

- [ ] **Step 3: `docs/configuring.md`**

In the "Voice & settings" section, replace whatever describes the language field with:

```markdown
**Working language** is the language the curator and the weekly digest are
written in. Posts do not have to follow it: each channel under **Channels** can
write in another language, and any single post can be rewritten into another one
from the queue. The digest has the same override on its own page. All three
translate what exists rather than regenerating it, so your edits survive.

**Picture** is only used by the previews in the publication queue. It is stored
next to the database and sent nowhere.
```

- [ ] **Step 4: Verify**

Run: `npm run check`
Expected: clean (documentation only, but the fenced TSX in `extending.md` should be checked by eye against `PreviewProps` in `src/components/previews/types.ts`).

- [ ] **Step 5: Commit**

```bash
git add README.md docs/extending.md docs/configuring.md
git commit -m "docs: preview skins as the fifth plugin point"
```

---

## Final verification (spec §11)

Not a task with code — the pass that says the feature is done. Run it once, end to end, on a database that has real items in it.

- [ ] `npm run check` is clean.
- [ ] `npm run build` succeeds.
- [ ] Set two channels to different languages, run the full pipeline, and confirm each channel's drafts come out in its own language while the digest follows the working language.
- [ ] Change one post's language from the queue: the body, the hashtags, the character counter and the language chip all update, and the post's image and link are untouched.
- [ ] Change the digest's language: title, subtitle and markdown come back translated, and the markdown structure survives.
- [ ] Upload an image to a post, restart the server (`Ctrl-C`, `npm run dev`), and confirm the image is still there — the file is under `data/media/` and the post still points at it.
- [ ] Compare the LinkedIn skin against a real LinkedIn draft, specifically where the "…see more" cut falls. Tune `FOLD` in `linkedin.tsx` if needed.
- [ ] Confirm a channel with no skin falls back to the generic preview.
- [ ] Confirm `/media/..%2Fsignal.db` returns 404.

- [ ] **Open the pull request**

`main` is protected and the `pre-push` hook refuses direct pushes.

```bash
git push -u origin feat/post-language-preview-media
gh pr create --title "Post language, network preview, images and links" --body "$(cat <<'BODY'
Implements docs/superpowers/specs/2026-09-04-post-language-preview-media-design.md.

- **Language** per channel with a per-post override, and the same override on the weekly digest. Both translate what exists through a new fifth prompt rather than regenerating, so edits survive.
- **Images** captured from the feed at ingest, filled in from `og:image` for the handful of items that survive curation, replaceable by an upload into `DATA_DIR/media/`.
- **Links** with a card resolved once and cached, never fetched while rendering.
- **Preview** as a fifth plugin point: `src/components/previews/` with LinkedIn, X and Instagram skins and a generic fallback for invented channels.
- The image travels as far as the webhook payload and the download button. Mastodon and Bluesky stay text-only, with a comment in each marking where media upload would go.

Nine columns, all through the existing `ensureColumn()`, so an old database migrates itself on first boot.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```
