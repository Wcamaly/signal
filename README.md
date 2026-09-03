# Signal

**An AI trend radar that reads your sources, decides what is worth saying, writes
the weekly digest, and drafts the posts. You approve them.**

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

Four plugin points, each a single file plus one line in a registry:

| I want to… | Add a… | In |
|---|---|---|
| read from somewhere new | source kind | `src/lib/sources/kinds/` |
| use a different model | LLM provider | `src/lib/llm/providers/` |
| write for another platform | channel | the UI |
| actually deliver a post | publisher | `src/lib/publishers/` |

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

### Docker / systemd / LXC

`deploy/install.sh` installs the app in a Debian container with a systemd
service and a weekly timer. `deploy/create-lxc.sh` creates that container on a
Proxmox host. The `Dockerfile` builds a standalone image.

### k3s with Argo CD

The manifests use Kustomize and Argo CD. The `signal` namespace holds only this
project and keeps SQLite on a PVC, so there is one replica and the pipeline runs
as a `CronJob` on Mondays at 08:00.

```bash
# 1. Namespace and image (built locally, imported into the node's containerd)
kubectl apply -f deploy/kustomize/base/namespace.yaml
bash deploy/load-local-image-k3s.sh

# 2. Secret — kept out of Git
export CRON_SECRET="a-long-secret"
export SIGNAL_SECRET_KEY="another-long-secret"   # encrypts credentials stored from the UI
export ANTHROPIC_API_KEY="sk-ant-..."            # optional, can be pasted in the UI instead
bash deploy/create-secret-k3s.sh

# 3. Argo CD application
kubectl apply -f deploy/argocd/project.yaml
kubectl apply -f deploy/argocd/application.yaml
kubectl -n argocd wait application/signal --for=jsonpath='{.status.sync.status}'=Synced --timeout=180s
```

Argo syncs `deploy/kustomize/overlays/production` — PVC, Deployment, Service,
Ingress and `CronJob`. Change the timezone in
`deploy/kustomize/base/configmap.yaml` and `cronjob.yaml`. To ship a local
update, run `load-local-image-k3s.sh` again.

```bash
kubectl -n signal get pods,pvc,cronjobs
kubectl -n signal logs deploy/signal
kubectl -n signal create job --from=cronjob/signal-pipeline signal-pipeline-manual
kubectl -n signal port-forward svc/signal 3000:3000     # without the Ingress
```

Traefik publishes Signal at `http://signal.192.168.1.240.nip.io`. If your network
does not resolve `nip.io`, add `192.168.1.240 signal.local` to `/etc/hosts` and
change the host in `deploy/kustomize/base/ingress.yaml`. That route is plain HTTP
inside the local network.

State lives in the `signal-data` PVC (`/app/data/signal.db`) — back it up, or use
the snapshot mechanism of its StorageClass. Losing it loses the digests, the
posts and the credentials stored from the UI.

**Signal has no authentication of its own.** Run it on localhost, on a homelab,
or behind a VPN or an authenticating proxy — never on a public IP as it is. See
[SECURITY.md](SECURITY.md).

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
