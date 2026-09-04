# Post language, network preview, images and links

Date: 2026-09-04
Status: approved, ready for planning

## Problem

Three things are missing from the publication queue, and they compound:

1. **Language is one global switch.** `voice.language` is a free-text field that
   feeds every prompt. You cannot write LinkedIn in Spanish and X in English,
   you cannot ask for one post in another language, and you cannot get the
   weekly digest in a different language from the posts.
2. **There is no preview.** The queue shows the template output as grey
   monospace in a `<pre>`. You cannot see where LinkedIn will cut the text, how
   the thread breaks on X, or what the post looks like with an image.
3. **A post is text and nothing else.** No image, no link of its own. The agent
   returns a body and hashtags; everything visual is a `visual_brief` in prose.

## Current state (verified against the code)

| Piece | Today |
|---|---|
| Language | `DEFAULT_VOICE.language` in `src/lib/types.ts`, injected as `{{language}}` into all four prompts through `voiceVars()` |
| Preview | `PostCard.tsx` renders `renderTemplate(...)` into a `<pre>` behind a "Template preview" toggle |
| Image | `posts.visual_brief` only — prose describing slides. No column, no upload, no ingest capture |
| Link | `{{link}}` in the channel template, resolved from the source item's URL at publish time |
| Ingest | No source kind extracts an image. `feed.ts` reads `media:group` but only for the summary text |
| Migrations | `ensureColumn()` in `db.ts` adds columns to existing databases on boot |
| Tests | None. CONTRIBUTING states a test setup is a PR of its own |

## Decisions

| Question | Decision |
|---|---|
| When is the post language chosen? | Per channel, with a per-post override |
| Where does the image come from? | `og:image` of the source, replaceable by upload |
| How faithful is the preview? | A skin registry: LinkedIn, X, Instagram + a generic fallback |
| How far does the image travel? | Preview, download and webhook payload. Not Mastodon/Bluesky media APIs |
| Does the digest get a language too? | Yes — it follows the working language, with its own override |

## 1. Language model

Two levels, because the digest and the posts are not the same artefact.

| Level | Governs | Configured in | Default |
|---|---|---|---|
| Working language | Curator `why`/`angle`, the weekly digest | Settings → Voice (the existing `language` field) | English (`DEFAULT_VOICE.language`) |
| Output language | The posts of one channel | Settings → Channels, per channel | inherits the working language |
| Override | One post, or one digest | Selector on the card / on the digest page | — |

`channels.language` and `digests.language` are nullable; `NULL` means inherit.
`posts.language` is written by the writer and is never null after generation.

**Input control.** The free-text field becomes a `<select>` with Español,
English, Português, Français, Deutsch, Italiano and an "Other…" entry that
reveals the free-text input. The stored value is the display string itself
(`"English"`), because the prompts already read `Write in this language:
{{language}}` — no locale codes, no mapping table.

**The override is a translation pass, not a re-run.** Regenerating a post or a
digest from scratch would discard the edits already made and cost a full
generation. Instead a fifth prompt is added:

- Key `translate`, listed in `PROMPT_DEFINITIONS` alongside the other four, so
  it appears in Settings → Prompts automatically and can be reset like the rest.
- Used by both overrides: same job in both cases — translate while keeping the
  voice, obeying the banned list literally, and not translating hashtags word
  for word.
- One shape rule, so one template covers both: the prompt receives
  `{{content}}` as a JSON object and returns **the same keys, translated**. A
  post sends `{hook, body, hashtags}`; a digest sends `{title, subtitle,
  markdown}`. Nothing in the prompt is per-artefact.
- After a post is translated, `char_count` and `language` are updated; after a
  digest, `language`.

## 2. What the agent returns

The writer's JSON gains three fields:

```json
{
  "item_index": 0,
  "angle": "…", "hook": "…", "body": "…", "hashtags": ["#tag"],
  "visual_brief": "…",
  "link": "https://…",
  "image_alt": "one line describing the source image",
  "use_source_image": true
}
```

- `link` is chosen from the material the writer receives; it defaults to the URL
  of the signal the post is built on.
- `use_source_image` lets the writer decline an image that does not fit the
  post; `false` leaves `posts.image_url` null and the preview renders textual.
  The agent never invents an image — it picks from what ingest captured.

**The writer prompt template does not change.** It already says *Write them in
this language: {{language}}*; the writer resolves `{{language}}` to the
channel's language instead of the working one before rendering. Renaming the
variable would silently break every prompt a user has already customised, since
overrides live in the `prompts` table and are not migrated.

## 3. Images

### Where they come from

`items.image_url`, filled in two passes:

1. **From the feed, free.** `media:thumbnail`, `media:content` and RSS
   `enclosure`; the `media:group` that `feed.ts` already parses covers YouTube.
   Reddit exposes `thumbnail`.
2. **From `og:image`, for what has none.** GitHub, arXiv and Hacker News do not
   carry an image in their payload. A small `ogImage(url)` helper fetches the
   page and reads `<meta property="og:image">`.

The second pass runs at the end of the curate stage, **only over the items left
with status `selected`**, not over everything ingested — roughly ten fetches a week instead of two hundred. It has
a short timeout and never fails the run: an item with no image is normal.

### Where they live

`DATA_DIR/media/`, next to `signal.db`. Same volume, so the existing backup
advice in the README stays true with no changes. The filename is a hash of the
content plus the extension, so uploading the same image twice does not
duplicate it.

Served by a route handler that resolves the requested name against the
directory listing and refuses anything not found in it — never by concatenating
user input into a path. This project's Next version has breaking changes from
the common patterns; read `node_modules/next/dist/docs/` before writing the
route handler and the server action, per AGENTS.md.

### How they are set

A server action taking `FormData`, capped at 8 MB, accepting `jpeg`, `png`,
`webp` and `gif`. A post's image can also be a plain URL (the one inherited
from the item), so `posts.image_url` holds either an external URL or the path
served from the media store.

## 4. Links

`posts.link` is editable and defaults to the source signal's URL.

The preview's link card needs a title and an image for the destination. When
the link is the signal's own URL, both already exist in `items`. When you paste
a different URL, a button resolves the `og:` tags once and stores the result in
`posts.link_title` and `posts.link_image`. Nothing is fetched during render.

The same `og:` parser serves this and the ingest image pass — one helper, two
callers.

## 5. The preview

A fifth extension point, shaped like the four that exist:

```
src/components/previews/
  index.ts        getPreviewSkin(channelKey) → a skin, or the generic one
  linkedin.tsx    light theme, cut at ~210 chars with "…see more", 1.91:1 image
  x.tsx           dark theme, thread split on \n---\n, 280 per bubble
  instagram.tsx   square image first, caption cut at ~125 chars, tags last
  generic.tsx     fallback for invented channels
```

Every skin receives the same props:

```ts
type PreviewProps = {
  author: string; avatar: string | null; handle: string | null;
  text: string; hashtags: string[];
  image: string | null; imageAlt: string | null;
  link: string | null; linkCard: { title: string; image: string | null } | null;
  charLimit: number;
};
```

`text` is **the channel template's output**, not the raw body — the same string
the Copy button puts on the clipboard. A preview of anything else would lie.

Each skin carries its own isolated theme and does not inherit the application's
dark tokens. A faithful LinkedIn preview is white even though Signal is black.

The truncation lengths are constants at the top of each skin, with a comment
saying they are observed values that the platforms change without notice.

**Author identity.** Neither an avatar nor a handle exists today. `voice.avatar`
is added (a URL, or an upload into the same media store), and each channel gets
a `handle` in its existing `config` JSON — no new column. Without them the
preview draws the author's initials on the channel colour.

## 6. The queue

`PostCard.tsx` is already 330 lines and this change adds an image control, a
language selector, a link editor and a preview to it. It is split first, along
the seams the new work creates:

| File | Responsibility |
|---|---|
| `PostCard.tsx` | The shell: header, status, action bar |
| `PostEditor.tsx` | Textarea and save |
| `PostMedia.tsx` | Image: upload, paste URL, alt text, remove, download |
| `PostLanguage.tsx` | Language selector and the translation call |
| `PostPreview.tsx` | Picks the skin and assembles its props |

The body area becomes three tabs — **Edit / Preview / Template** — replacing the
two independent toggles it has today.

## 7. Publishing

- The `webhook` publisher's payload gains `image_url` (absolute) and `link`.
- A "Download image" button on the card, for the copy-paste path that the
  README describes as the deliberate default.
- Mastodon and Bluesky keep sending text only, with a comment in each adapter
  marking where `uploadBlob` / `/api/v2/media` would go.

## 8. Schema changes

All through the existing `ensureColumn()`, so an old database migrates itself on
first boot:

| Table | Column | Type |
|---|---|---|
| `items` | `image_url` | TEXT |
| `channels` | `language` | TEXT (NULL = inherit) |
| `digests` | `language` | TEXT |
| `posts` | `language` | TEXT |
| `posts` | `link` | TEXT |
| `posts` | `link_title` | TEXT |
| `posts` | `link_image` | TEXT |
| `posts` | `image_url` | TEXT |
| `posts` | `image_alt` | TEXT |

## 9. Implementation order

The pieces interlock — the preview needs the image and the link to exist, and
the media control needs somewhere to store a file — so they land in this order,
each step leaving the app working:

1. **Schema and language.** All nine columns, the language `<select>`, the
   per-channel field, the `translate` prompt, and both overrides. Ships value on
   its own: languages work with no preview and no images.
2. **Ingest images and links.** `items.image_url`, the `og:` helper, the curate
   post-pass, the writer's three new JSON fields, `posts.link` and its unfurl.
   Still no UI beyond a URL in a field.
3. **The media store.** `DATA_DIR/media/`, the route handler, the upload action.
4. **The card split.** `PostCard.tsx` into five files, tabs replacing the two
   toggles, no behaviour change. Done before the preview so the preview lands in
   a file that is already the right size.
5. **The skins.** The registry, the generic fallback first, then LinkedIn, X and
   Instagram.
6. **Publishing.** Webhook payload fields and the download button.

## 10. Out of scope

Deliberately excluded, and each one is a later change of its own:

- Generating images with an AI provider. The LLM registry is text-only and the
  README promises the pipeline runs air-gapped.
- Real media upload to Mastodon and Bluesky.
- Translating the radar item by item.
- Holding one post in several languages at once. A post has one language; two
  languages means two posts.

## 11. Verification

No test framework exists and adding one is out of scope per CONTRIBUTING.

- `npm run check` (lint + typecheck) must pass.
- Manual pass: run the pipeline with two channels set to different languages;
  change one post's language and confirm the body, hashtags, `char_count` and
  the language chip all update; upload an image and confirm it survives a
  restart; compare the LinkedIn skin against a real post, specifically where
  the "…see more" cut falls; confirm a channel with no skin falls back to the
  generic one.
