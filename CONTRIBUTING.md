# Contributing to Signal

Thanks for being here. Signal is small on purpose: one SQLite file, no external
services, four extension points. That makes it easy to contribute to, and worth
keeping that way.

---

## The rule that matters

**`main` is protected. Nothing is pushed to it directly — every change lands
through a pull request.**

Two things enforce it:

- **On your machine** — `.githooks/pre-push` refuses a push to `main` or
  `master`. It is enabled by `npm install`; if you skipped that, run
  `git config core.hooksPath .githooks`.
- **On GitHub** — a ruleset blocks direct pushes, force pushes and deletion of
  the default branch. Maintainers apply it with `bash scripts/protect-main.sh`.

If you have admin rights and genuinely need one direct push, the hook takes
`SIGNAL_ALLOW_PUSH_MAIN=1`. The GitHub ruleset will still say no, which is the
point.

---

## The loop

```bash
git clone https://github.com/Wcamaly/signal.git
cd signal
npm install                 # also installs the git hooks
cp .env.example .env.local  # optional: everything can be set from the UI
npm run dev                 # http://localhost:3000

git switch -c feat/reddit-source
# …work…
npm run check               # lint + typecheck
npm run build

git push -u origin feat/reddit-source
gh pr create --fill
```

`main` requires one approval from the maintainer listed in `.github/CODEOWNERS`.
Only repository collaborators with write access can merge; public contributors
can open pull requests without receiving merge access.

Branch names: `feat/…`, `fix/…`, `docs/…`, `refactor/…`, `chore/…`.

Commits: present tense, one idea per commit, no trailing period —
`Add Reddit source kind`, `Fix week key on year boundary`. History is not
squashed on your behalf, so write messages you would want to read in
`git log` a year from now.

---

## What makes a PR easy to merge

- **One thing.** A new source kind and a UI refactor are two pull requests.
- **`npm run check` and `npm run build` pass.** CI runs both on every PR.
- **You ran it.** For a plugin, say what you pointed it at and what came back.
  "18 items from `github:vercel/next.js`" is worth more than a paragraph of
  description.
- **No secrets.** Not in the diff, not in the screenshots, not in the logs you
  paste. Signal deals with API keys for a living; be careful with your own.
- **Docs where behaviour changed.** New configuration goes in
  [`docs/configuring.md`](docs/configuring.md); new extension points go in
  [`docs/extending.md`](docs/extending.md).

Discussion happens in the PR. Expect questions about editorial defaults in
particular: the prompts are the product, and a change there affects everyone's
output.

---

## The four things you can add without touching the core

Each one is a single file plus one line in a registry. Full walkthroughs, with
the type you have to implement, are in **[docs/extending.md](docs/extending.md)**.

| Extension point | Where | What it gives you |
|---|---|---|
| **Source kind** | `src/lib/sources/kinds/` | A new place to read from (an API, a feed, a scraper) |
| **LLM provider** | `src/lib/llm/providers/` | A new model backend |
| **Channel** | the UI, or `DEFAULT_CHANNELS` | A new publishing target with its own format and template |
| **Publisher** | `src/lib/publishers/` | Actually delivering a post to a platform |

Contributions that add one of these are the most welcome kind, because they are
the ones the maintainer cannot write for everyone: you know your sources and
your platforms better.

---

## Project layout

```
src/
  app/                     pages (dashboard, radar, digest, posts, sources, settings/*) and /api/cron
  components/              client components; the server passes them plain data, never a fetcher
  lib/
    db.ts                  SQLite schema, migrations, settings helpers
    secrets.ts             AES-256-GCM for credentials at rest
    credentials.ts         credential store; the UI never receives a secret back
    llm/                   provider registry + the chat/chatJson façade
    sources/               source-kind registry, one file per kind
    channels.ts            publishing targets and their templates
    publishers/            publisher registry, one adapter per platform
    prompts.ts             shipped prompts + the overrides written from the UI
    template.ts            the {{variable}} renderer used by prompts and templates
    agents/                curator, digest, writer — the stages that call the model
    pipeline.ts            orchestration and run log
    actions.ts             every server action the UI calls
```

Two conventions worth knowing:

1. **Registries hand out metadata, not implementations.** `providerCatalog()`,
   `sourceKindCatalog()` and `publisherCatalog()` strip the function before the
   data reaches a client component. Keep it that way — a fetcher in a client
   bundle is a build error waiting to happen.
2. **Nothing is special-cased by key.** LinkedIn is a row in `channels`, exactly
   like a channel you invent. If you find yourself writing `if (platform ===
   "x")` in the core, there is a field missing on the channel instead.

---

## Style

- TypeScript, `strict`. No `any` that a five-line type would have avoided.
- Comments explain *why*, and only where the reason is not on the screen.
- Match the file you are in: this codebase is dense and quiet, without ceremony.
- User-facing strings in English. The *output* language is a setting
  (`voice.language`), so the app writing Spanish posts is configuration, not a
  fork.

There are no unit tests yet. If you add a test setup, that is a PR of its own —
propose it in an issue first so we agree on the runner before you write 40 files.

---

## Reporting a bug

Open an issue with the run log (`runs` table, or the panel on the dashboard),
the provider and model you used, and what you expected instead. If it involves a
source, include the URL you configured.

Security issues do not go in the issue tracker — see
[SECURITY.md](SECURITY.md).

---

## Licence

By contributing you agree that your contribution is licensed under the
[MIT licence](LICENSE), like the rest of the project.
