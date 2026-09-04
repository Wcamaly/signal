# Extending Signal

Four things are plugins. Each is one file plus one line in a registry, and each
shows up in the UI on its own — there is no separate registration step, no
config file to edit, no build flag.

| I want to… | Add a… | In |
|---|---|---|
| read from somewhere new | source kind | `src/lib/sources/kinds/` |
| use a different model | LLM provider | `src/lib/llm/providers/` |
| write for another platform | channel | the UI (or `DEFAULT_CHANNELS`) |
| actually deliver a post | publisher | `src/lib/publishers/` |

---

## Add a source

A source kind turns a string the user types (`hn:agents`, `github:vercel/next.js`)
into a list of items. Everything else — deduplication, the age cutoff, week
assignment, error reporting — is handled by the ingest orchestrator.

```ts
// src/lib/sources/kinds/lobsters.ts
import type { SourceKind } from "../types";
import { fetchJson, num } from "../util";

export const lobstersKind: SourceKind = {
  id: "lobsters",
  label: "Lobsters",
  urlLabel: "Tag",
  placeholder: "lobsters:ai",
  help: "Hottest stories for a Lobsters tag.",
  configFields: [{ key: "minScore", label: "Minimum score", type: "number", placeholder: "10" }],

  async fetch(source) {
    const tag = source.url.replace(/^lobsters:/, "");
    const stories = await fetchJson<Story[]>(`https://lobste.rs/t/${tag}.json`);
    return stories
      .filter((s) => s.score >= num(source.config, "minScore", 10))
      .map((s) => ({
        external_id: `lobsters:${s.short_id}`,
        title: s.title,
        url: s.url || s.comments_url,
        author: s.submitter_user,
        summary: `${s.score} points · ${s.comment_count} comments`,
        published_at: s.created_at,
      }));
  },
};
```

Then register it:

```ts
// src/lib/sources/index.ts
export const SOURCE_KINDS: SourceKind[] = [rssKind, hnKind, arxivKind, githubKind, redditKind, youtubeKind, lobstersKind];
```

That is the whole job. The "add a source" form picks up `label`, `urlLabel`,
`placeholder`, `help` and renders an input for every `configFields` entry, and
the **Test** button on each row calls your `fetch` without writing anything.

Notes:

- `external_id` must be stable across runs — it is the deduplication key.
- Throw a plain `Error` with a readable message when the input is wrong. It ends
  up in `sources.last_error` and is shown under the source in red.
- `parseFeed(url, maxItems)` from `kinds/feed.ts` parses RSS *and* Atom; the
  GitHub, YouTube and Reddit-fallback kinds are all thin wrappers around it.
- Prefer endpoints that need no key. If yours needs one, read it from the
  credential store rather than an environment variable.

---

## Add an LLM provider

A provider is a `chat` function plus the metadata the picker needs.

```ts
// src/lib/llm/providers/mistral.ts
import type { LlmProvider } from "../types";
import { openAiCompatibleChat } from "./openai-compatible";

export const mistralProvider: LlmProvider = {
  id: "mistral",
  label: "Mistral",
  docsUrl: "https://console.mistral.ai/api-keys",
  needsKey: true,
  keyLabel: "API key",
  keyPlaceholder: "…",
  envKeys: ["MISTRAL_API_KEY"],
  defaultBaseUrl: "https://api.mistral.ai/v1",
  models: ["mistral-large-latest", "mistral-small-latest"],
  defaultModel: "mistral-large-latest",
  supportsTemperature: true,
  chat: (req, ctx) => openAiCompatibleChat(req, ctx, "mistral"),
};
```

Register it in `PROVIDERS` (`src/lib/llm/index.ts`) and it appears in
**Model & keys**, with its own credential slot and a working *Test connection*
button.

If the API speaks the OpenAI chat-completions shape, reuse
`openAiCompatibleChat` as above — that is what OpenAI, OpenRouter, Groq, Ollama
and the generic custom endpoint all do. Otherwise write the request yourself; see
`providers/google.ts` for a short non-OpenAI example, and use `postJson` from
`../types` so timeouts and error messages stay consistent.

Two constraints that bit us already, worth knowing before you write a provider:

- **No assistant prefill.** Forcing JSON by prefilling `[` is rejected by current
  Claude models. Every agent asks for JSON in the prompt and parses the answer
  with `extractJson`, which tolerates fences and surrounding prose.
- **Temperature is not universal.** Current Claude models reject the parameter;
  the Anthropic provider omits it for them. If your backend has the same
  behaviour, filter it inside your `chat`, not in the caller.

---

## Add a channel

A channel is data, not code: **Settings → Channels → New channel**. It has a key,
a character limit, a *format hint* (injected into the writer prompt), a
*template* (what actually gets published), a publisher, and how many posts the
pipeline should draft for it per run.

Shipping a new one as a default for everyone means adding an entry to
`DEFAULT_CHANNELS` in `src/lib/channels.ts` — a seed, so it only applies to
databases that do not have that key yet.

Templates take `{{body}}`, `{{hook}}`, `{{hashtags}}`, `{{angle}}`, `{{link}}`
and `{{title}}`. A line whose placeholders all resolve to empty is dropped, so
an optional `{{hashtags}}` line never leaves a blank gap.

---

## Add a publisher

A publisher takes a post that is already rendered through its channel template
and delivers it.

```ts
// inside src/lib/publishers/index.ts, or its own file
const devto: Publisher = {
  id: "devto",
  label: "dev.to",
  help: "Publishes an article through the dev.to API. Create the key under Settings → Extensions.",
  needsCredential: true,
  credentialLabel: "API key",
  configFields: [{ key: "series", label: "Series", placeholder: "AI radar" }],

  async publish(ctx) {
    if (!ctx.secret) throw new Error("This channel has no API key stored");
    const { json } = await postJson(
      "https://dev.to/api/articles",
      { article: { title: ctx.post.hook, body_markdown: ctx.rendered, published: true } },
      { "api-key": ctx.secret },
    );
    return { url: typeof json.url === "string" ? json.url : null };
  },
};
```

Add it to `PUBLISHERS` and any channel can select it. The editor renders your
`configFields`, and a password input appears when `needsCredential` is true —
the value is encrypted and linked to that channel, never returned to the browser.

The post is marked `published` (with `published_url` when you return one) only if
`publish` resolves. Throw with a readable message and the UI shows it and leaves
the post where it was.

Before writing a platform integration, check whether the **webhook** publisher
already solves it: it POSTs the post as JSON to any URL, which covers n8n, Make,
Zapier, a scheduler or a CMS of your own without an app review from anyone.

---

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
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={imageAlt ?? ""} style={{ width: "100%", marginTop: 8, borderRadius: 8 }} />
          )}
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
  `globals.css` sets a default border colour on everything, so state yours.
- **`text` is the channel template's output**, not the raw body — the same
  string the Copy button gives you. A preview of anything else would lie. That
  also means the hashtags are usually already inside `text`: render the
  `hashtags` prop as well and they appear twice.

---

## Add a language

The interface ships in English and Spanish. A locale is one file plus one line
in the registry.

`src/lib/i18n/en.ts` is the source of truth, and `Dictionary` is derived from
it, so a locale that loses a key fails the build rather than falling back
silently. Copy `es.ts` and translate the values:

```ts
// src/lib/i18n/pt.ts
import type { Dictionary } from "./en";

export const pt: Dictionary = {
  localeLabel: "Português",
  app: {
    metaTitle: "Signal — radar de IA e publicações",
    // …
  },
  // …
};
```

Register it in `src/lib/i18n/locales.ts`:

```ts
import { pt } from "./pt";

export const UI_LOCALES: Record<string, Dictionary> = { en, es, pt };
```

It appears in **Settings → Interface language** immediately; `localeLabel` is
what the picker shows, written in its own language.

Three things to know:

- **Strings that take a value are functions**, not format strings:
  `summary: (chars, posts, language) => …`. The argument is typed, and your
  language puts it where its grammar needs it — including plurals, which no
  format string gets right for every language.
- **`registry` translates the plugin registries by id** — source kinds,
  publishers and prompts. Leave an entry out and it keeps the English it ships
  with, so a third-party source kind works untranslated instead of breaking.
- **Client components import `lib/i18n/locales`, never `lib/i18n`.** The index
  reads the stored setting and therefore imports the database; pulling that into
  the browser bundle breaks every page. Server components call
  `getDictionary()`, client components call `useT()`.

This is the language of the *interface*. What the model writes is a different
setting entirely — see `src/lib/languages.ts`.

---

## Add a prompt variable

Prompts are rendered with the same `{{variable}}` engine as templates. The
variables come from `voiceVars()` in `src/lib/agents/shared.ts` plus whatever the
stage adds (`items`, `signals`, `digest`, `channel_hint`, …). To expose a new
one:

1. Add it to the object the agent passes to `renderPrompt`.
2. Declare it in `variables` of that prompt in `PROMPT_DEFINITIONS`
   (`src/lib/prompts.ts`) so it shows up in the editor's variable list.

Users who already customised that prompt keep their version — their override
simply will not use the new variable until they add it.
