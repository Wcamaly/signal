# Configuring Signal

Everything on this page is set from the UI. The environment variables in
`.env.example` are fallbacks for the things you may want to pin in a deployment;
none of them is required.

---

## Model & keys

**Settings → Model & keys.**

Pick a provider, a model, and paste the key. Signal ships with Anthropic,
OpenAI, Google, OpenRouter, Groq, Ollama, and a generic OpenAI-compatible entry
for anything else (vLLM, LM Studio, Together, DeepSeek, your own gateway).

- **Model** is a free text field with suggestions. Any model id the provider
  accepts works, including one released after this version of Signal.
- **Base URL** lets you point a provider at a proxy or a self-hosted server.
- **Temperature** applies where the backend accepts it. Current Claude models
  reject the parameter and Signal omits it for them.
- **Max tokens** is the ceiling for a single response. The curator sends up to
  120 items in one request; if a run fails with *"the response ended in the
  middle of a JSON value"*, this is the number to raise.
- **Test connection** does one cheap round trip and shows the answer or the
  error verbatim.
- **Workspace ID** (Anthropic only) is needed when the key is identity-linked,
  that is shared across the workspaces of an organisation. Those keys are
  rejected with *"anthropic-workspace-id is required"* until the request names
  the workspace it acts in; paste the `wrkspc_...` id here, or set
  `ANTHROPIC_WORKSPACE_ID`. Workspace-scoped keys ignore it.

Keys are encrypted with AES-256-GCM before being stored, and the interface only
ever shows the last four characters. The encryption key comes from
`SIGNAL_SECRET_KEY`, or is generated once into `data/.signal-key` if that is
unset — see [SECURITY.md](../SECURITY.md).

**Without any provider configured, Signal still runs.** Ingest works normally,
curation falls back to a keyword heuristic, and the digest and posts come out as
filler. It is enough to see the shape of the thing before spending a cent.

### Running fully local

Ollama needs no key: install it, `ollama pull llama3.3`, select **Ollama
(local)** and save. Nothing leaves the machine — which, combined with SQLite and
no external services, means the whole pipeline can run air-gapped.

---

## Voice & settings

**Settings → Voice & settings.** This is what separates a post that sounds like
you from one that sounds like an LLM.

Two fields do most of the work:

1. **Banned** — the phrases, tics and emoji you never want to see. This is what
   takes the machine smell out of the text.
2. **Samples of your writing** — paste two or three of your own posts that
   worked. Without them the writer is correct but neutral; with them it starts
   to sound like you.

**Positioning** and **editorial pillars** change what the *curator* scores
highly, so the radar filters by what is useful for you to say, not by what is
trending.

**Interface language** is the language of Signal itself — this menu, the
buttons, the labels. English and Spanish ship; adding one is a single file, see
[extending.md](extending.md). It is independent of everything below.

**Working language** is the language the curator and the weekly digest are
written in. Posts do not have to follow it: each channel under **Channels** can
write in another language, and any single post can be rewritten into another one
from the queue. The digest has the same override on its own page. All three
translate what already exists rather than regenerating it, so your edits
survive.

**Picture** is used only by the previews in the publication queue. It is stored
next to the database and sent nowhere.

The **Pipeline** section holds two knobs: how many signals survive curation each
week, and how old an item can be at ingest before it is dropped. The first one
also sized the general digest when it was created; its item count lives under
**Settings → Digests** now.

---

## Sources

**Sources.** Six kinds ship: RSS/Atom, Hacker News, arXiv, GitHub, Reddit and
YouTube. None needs an API key.

| Kind | What you type | Options |
|---|---|---|
| RSS / Atom | `https://example.com/feed.xml` | max items |
| Hacker News | `hn:ai`, `hn:agents`, `hn:"prompt injection"` | minimum points, window |
| arXiv | `arxiv:cs.AI` | max papers |
| GitHub | `github:owner/repo` | releases / tags / commits, branch |
| Reddit | `reddit:LocalLLaMA` | minimum score, window |
| YouTube | `youtube:UC…` (channel) or `youtube:PL…` (playlist) | max videos |

**Test** on any row fetches it right there and tells you how many items came
back, without writing anything. Feeds that fail record the error under the
source; a broken feed never stops a run.

The defaults are a starting point, not a recommendation. Replace them with what
you actually read — the radar is worth exactly what its sources are worth.
Adding a new *kind* is a small file: [docs/extending.md](extending.md).

### Categories

Every source belongs to one category. The **Categories** box at the top of
**Sources** creates, renames, recolours, reorders and deletes them; the select
on each source row moves it. The chips above the list filter sources, and the
same chips filter the radar and the digest archive.

- A digest of its own for one or more categories is a **digest definition**,
  under **Settings → Digests** — see [Digests](#digests) below.
- Deleting a category moves its sources to **General** and takes it out of every
  digest definition. A definition left with no category is **disabled** rather
  than silently widened to every category. General itself cannot be deleted.
- A deleted shipped category comes back only if one of its default sources is
  restored: its sources keep their URLs when they move to General, so
  **Restore default sources** has nothing to add for them.

---

## Digests

**Settings → Digests.** A digest definition says what a digest is made of and
how often it is written.

- **Cadence** — daily, weekly or monthly. A run writes every enabled definition
  that is due: daily ones every day, for yesterday; weekly ones on Monday, for
  the ISO week that just closed; monthly ones on the 1st, for the month that
  just closed. Days and months follow the server's time zone (`TZ`).
- **Categories** — the sources that feed it. None ticked means every category.
- **Items** — how many items feed it. The curator's picks (and the items
  already written about) go first, then the best scored of the period. Items
  you rejected on the radar never go in. A period with nothing scored is
  skipped with a warning in the run log.
- **General** always exists: weekly, every category. It feeds the dashboard and
  every channel not bound to another digest. It can be edited and disabled, not
  deleted.
- Deleting a definition sends its channels back to General. The digests it
  already wrote stay in the archive, under its key.
- The prompt follows the shape: a definition with no categories uses **Digest
  (all categories)**, one with categories uses **Category digest**, with
  `{{category}}` set to their names. `{{week}}` holds the period key —
  `2026-W43`, `2026-10-23` or `2026-10`. The shipped prompts talk about "the
  week"; edit them if you run daily digests.

Coming from category digests: on the first boot every category that had its
weekly digest turned on became a weekly definition with the same key,
categories and item count, and each channel bound to a category now points at
that definition.

The archive filters by definition, and each card shows its cadence and period.

---

## Channels

**Settings → Channels.** A channel is any place a draft can end up: a social
network, a newsletter, your blog.

- **Format hint** goes into the writer prompt. This is where you say "thread,
  dense, no filler" or "carousel, visual first".
- **Character limit** is passed to the writer and used by the counter in the
  publications queue.
- **Template** is what actually gets published: `{{body}}`, `{{hook}}`,
  `{{hashtags}}`, `{{angle}}`, `{{link}}`, `{{title}}`. Empty placeholder lines
  are dropped. The **Template preview** button on each post shows the result.
- **Posts per run** is how many drafts the writer produces for this channel
  each time its digest is written. Set it to 0 to keep the channel for manual
  use only.
- **Source digest** is the digest definition the writer works from. The channel
  writes only in the runs where that definition is due — every day for a daily
  one, on Mondays for a weekly one, on the 1st for a monthly one — and quietly
  writes nothing on the other days. If its digest was due but skipped, the run
  log warns.

LinkedIn, X and Instagram are enabled by default; Threads, Bluesky, Mastodon,
newsletter and blog ship disabled. All of them are ordinary rows you can edit or
delete, and **New channel** creates your own.

### Publishing

Each channel picks a publisher:

- **Manual** (default) — Signal records the post as published, you copy and
  paste. Deliberate: LinkedIn and Instagram require a platform-reviewed app, and
  X charges for the access level involved. For one person publishing three times
  a week, copy-paste is cheaper than the paperwork.
- **Webhook** — POSTs the post as JSON to a URL of yours. This is the universal
  escape hatch: n8n, Make, Zapier, a scheduler, your CMS.
- **Mastodon** — real API. Create an application on your instance with the
  `write:statuses` scope and paste the token.
- **Bluesky** — real API, via an app password (never your account password).

Channel credentials are encrypted exactly like the LLM keys.

---

## Prompts

**Settings → Prompts.** The four prompts that run the pipeline — curator,
digest, writer, rewrite — are editable, with the variable list for each one next
to the editor. **Reset to default** deletes your override and restores the
shipped version, so experimenting is cheap.

Keep the JSON shape the agent asks for. If the answer stops parsing, the stage
fails with *"the response contains no JSON"* and the run log tells you which
stage it was.

---

## Automating the runs

`GET /api/cron` runs the pipeline once. Schedule it **once a day**, and protect
it with `CRON_SECRET` if the app is reachable from anywhere but localhost:

```bash
0 8 * * * curl -sS -H "authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron"
```

The Kubernetes overlay in `deploy/` already wires this as a `CronJob`, and the
systemd deployment as a timer.

### What a run works on

Ingest reads every source; an item is filed under the day and the ISO week it
was *published* in.

- **Curation** scores the items of the current week that have no score yet — it
  never scores an item twice — and on Monday the week that just closed too, so
  its Sunday is scored before the weekly digests are written.
- **Digests** — with no parameters, what is due:

  | Cadence | Due | Period written |
  |---|---|---|
  | daily | every run | yesterday |
  | weekly | Monday | the week that closed |
  | monthly | the 1st | the month that closed |

- **Posts** — the channels bound to the digests of this run.

Parameters:

- `stages=ingest,curate` runs part of the pipeline.
- `defs=general,ai-daily` writes those definitions — enabled or not — instead of
  what is due, for `period=`: `previous` (the default), `current`, or a key such
  as `2026-10-23`, `2026-W43` or `2026-10`. That is how you write a past period
  by hand. `period` without `defs` is refused.
- `week=previous` (or `current`, or `2026-W43`) is the old weekly schedule and is
  still accepted: it curates that week and writes every enabled weekly
  definition for it. A Monday `?week=previous` schedule keeps working, but
  daily and monthly definitions need the daily one.

The run dialog in the sidebar offers the same choice: what is due now, or one
definition and a period.

### Runs

**Runs** in the sidebar is the history: every execution with its stages, its
week, whether it was manual or scheduled, how long it took, its full log and the
numbers each stage produced. Any run can be launched again from its page, with
the same stages, the same week and the same digests.

Two pipelines never run at once — the second one is refused while the first is
in flight, because they write to the same week of the same SQLite file. A run
whose process disappeared (a pod evicted, a deploy mid-run) is marked
`interrupted` after 30 minutes instead of blocking everything after it.
