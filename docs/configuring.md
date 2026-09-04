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

**Working language** is the language the curator and the weekly digest are
written in. Posts do not have to follow it: each channel under **Channels** can
write in another language, and any single post can be rewritten into another one
from the queue. The digest has the same override on its own page. All three
translate what already exists rather than regenerating it, so your edits
survive. The interface itself is in English.

**Picture** is used only by the previews in the publication queue. It is stored
next to the database and sent nowhere.

The **Pipeline** section holds two knobs: how many signals survive curation each
week, and how old an item can be at ingest before it is dropped.

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
- **Posts per run** is how many drafts the writer produces for this channel each
  week. Set it to 0 to keep the channel for manual use only.

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

## Automating the weekly run

`GET /api/cron` runs the whole pipeline; `?stages=ingest,curate` runs part of it.
Protect it with `CRON_SECRET` if the app is reachable from anywhere but
localhost:

```bash
0 8 * * 1 curl -sS -H "authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron
```

The Kubernetes overlay in `deploy/` already wires this as a `CronJob`, and the
systemd deployment as a timer.
