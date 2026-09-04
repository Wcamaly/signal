# Signal

**A self-hosted AI trend radar for RSS, GitHub, Reddit, Hacker News, arXiv,
YouTube, and more.** Signal finds the stories worth your attention, creates a
weekly digest, and drafts posts for your channels. You review and approve every
publication.

Nothing is published on its own. The agent proposes; you edit, ask for
rewrites, and approve — one post at a time.

Self-hosted, single SQLite file, no external services. Bring your own model:
Claude, GPT, Gemini, or a local Llama through Ollama — the whole pipeline runs
air-gapped if you want it to.

[![CI](https://github.com/Wcamaly/signal/actions/workflows/ci.yml/badge.svg)](https://github.com/Wcamaly/signal/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Quick start

```bash
git clone https://github.com/Wcamaly/signal.git
cd signal
npm install
npm run dev          # http://localhost:3000
```

That is all. No `.env` needed to start: pick a provider and paste your key in
**Settings → Model & keys**, or run it with no model at all — ingest works
normally and the rest comes out as filler, which is enough to see the shape of
the thing before spending a cent.

The database creates itself at `./data/signal.db`.

Prefer Docker? `docker compose up -d` does the same thing, with the state in a
named volume.

---

## How it works

Four stages, chained. Run them together from **Run pipeline**, or separately if
you already have the earlier data.

| Stage | What it does | Uses the model |
|---|---|---|
| **Ingest** | Pulls items from your sources: RSS/Atom, Hacker News, arXiv, GitHub, Reddit, YouTube. Deduplicates, drops anything older than your window. | no |
| **Curate** | Scores every item from 0 to 100 by *how publishable it is for your audience*, not by how big the news is. Groups duplicates into one story, writes why it matters, proposes an angle. Selects the best per story. | yes |
| **Digest** | Writes the weekly working document: the read of the week, 3-5 signals with an angle, the noise to avoid, and your own theses. Not a newsletter — raw material. | yes |
| **Write** | Turns the digest into drafts, one pass per channel, each with that channel's format rules and your banned list. | yes |

Every run is recorded in the `runs` table with its log.

### The screens

- **Dashboard** — the state of the week, top signals, approval queue, last run.
- **Radar** — every item with its score, the why and the angle. Select or reject
  by hand what the curator got wrong.
- **Weekly digest** — the document, the signals that fed it, the posts that came
  out of it.
- **Publications** — the queue. Edit inline, **ask for a rewrite** with an
  instruction ("shorter and sharper", "take the opposite position"), preview what
  the template will publish, approve, schedule, publish.
- **Sources** — add, disable, test. Each row shows its last error and how many
  items it has contributed.
- **Settings** — voice, channels, prompts, model and keys.

---

## Everything is configurable

Nothing about this is hardcoded to one person's setup:

- **Your model.** Anthropic, OpenAI, Google, OpenRouter, Groq, Ollama, or any
  OpenAI-compatible endpoint. Provider, model id, base URL and limits are set in
  the UI, and *Test connection* tells you immediately if it works.
- **Your credentials.** Pasted in the UI, encrypted with AES-256-GCM before they
  touch the database, never sent back to the browser. Environment variables
  still work as a fallback.
- **Your sources.** Six kinds ship, none needs an API key, and a **Test** button
  fetches any source on the spot.
- **Your channels.** LinkedIn, X, Instagram, Threads, Bluesky, Mastodon,
  newsletter, blog — or one you invent. Each has its own character limit, format
  hint and publication template.
- **Your prompts.** All four are editable in the UI, with their variables listed
  next to the editor and a one-click reset to the shipped version.
- **Your voice.** Positioning, audience, pillars, banned phrases, writing
  samples, output language.
- **Your language, twice.** The interface ships in English and Spanish. What the
  model writes is a separate setting: a working language for the digest, an
  output language per channel, and an override on any single post.

Details in **[docs/configuring.md](docs/configuring.md)**.

### What changes the result the most

1. **Banned** — the phrases, tics and emoji you never want to see. This is what
   takes the machine smell out of the text.
2. **Samples of your writing** — two or three of your own posts that worked.
   Without them the writer is correct but neutral; with them it starts to sound
   like you.

---

## Publishing

The default is copy-paste, on purpose: LinkedIn and Instagram require a
platform-reviewed app and X charges for the access level involved. For one
person publishing three times a week, copy-paste costs less than the paperwork.

When you do want it automated, each channel picks a publisher: **webhook** (any
URL — n8n, Make, Zapier, your CMS), **Mastodon** or **Bluesky** through their
real APIs, or one you write yourself in about thirty lines —
see [docs/extending.md](docs/extending.md).

---

## Extending it

Six plugin points, each a single file plus one line in a registry:

| I want to… | Add a… | In |
|---|---|---|
| read from somewhere new | source kind | `src/lib/sources/kinds/` |
| use a different model | LLM provider | `src/lib/llm/providers/` |
| write for another platform | channel | the UI |
| actually deliver a post | publisher | `src/lib/publishers/` |
| see a post as a network draws it | preview skin | `src/components/previews/` |
| read the interface in your language | locale | `src/lib/i18n/` |

Walkthroughs with working code: **[docs/extending.md](docs/extending.md)**.

---

## Automating the weekly run

`GET /api/cron` runs the whole pipeline; `?stages=ingest,curate` runs part of it.
Protect it with `CRON_SECRET` if it is reachable from anywhere but localhost.

```bash
0 8 * * 1 curl -sS -H "authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron
```

---

## Deploying

**Docker:**

```bash
cp .env.example .env       # optional; the model and its key can be set in the UI
docker compose up -d       # http://localhost:3000
```

**A Debian box:** `bash deploy/install.sh` installs the app under systemd with a
weekly timer.

**Kubernetes:** `deploy/kubernetes/` is a Kustomize example — namespace, config,
PVC, deployment, service, ingress and the weekly CronJob. The host, the ingress
class and the timezone are placeholders; read it before applying it.

Backups, schedules, and the one mistake worth avoiding — **never let Argo CD or
Flux auto-sync a public repository into your cluster**, because then merging a
pull request deploys it — are covered in
**[docs/deploying.md](docs/deploying.md)**.

Whatever the shape: **Signal has no authentication of its own.** Run it on
localhost, on a homelab, or behind a VPN or an authenticating proxy — never on a
public address as it is. See [SECURITY.md](SECURITY.md).

State is one SQLite file plus the key that encrypts your stored credentials.
Back up the volume, the data directory, or the PVC — losing it loses the
digests, the posts and every credential saved from the UI.

---

## Project layout

```
src/
  app/                  pages and /api/cron
  components/           client components
  lib/
    db.ts               SQLite schema, migrations, settings
    secrets.ts          AES-256-GCM for credentials at rest
    credentials.ts      credential store (the UI never gets a secret back)
    llm/                provider registry + chat façade
    sources/            source-kind registry, one file per kind
    channels.ts         publishing targets and their templates
    publishers/         publisher registry, one adapter per platform
    prompts.ts          shipped prompts + UI overrides
    agents/             curator, digest, writer
    pipeline.ts         orchestration and run log
    actions.ts          server actions
```

---

## Contributing

Pull requests are welcome — new source kinds, providers and publishers most of
all, because those are the ones nobody can write for everyone.

**`main` is protected: every change lands through a pull request.** A local
`pre-push` hook (installed by `npm install`) refuses direct pushes, and a GitHub
ruleset enforces the same for everyone.

Read **[CONTRIBUTING.md](CONTRIBUTING.md)** before opening one. By participating
you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

---

## Licence

[MIT](LICENSE).
