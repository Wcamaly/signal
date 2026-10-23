# Screens: operation vs management, one screen per topic

Date: 2026-10-23
Status: approved, ready for planning

## Problem

Management and operation are mixed. "Sources" sits next to the radar in the
main block; the sources screen holds the category manager, the add form and the
source list at once; "Voice & settings" holds the interface language, the voice
profile and pipeline settings; "Model & keys" holds the provider and the
credentials; channels, digest definitions and categories are edited inline
inside long lists; running the pipeline is a dialog in the sidebar.

## Decisions

| Question | Decision |
|---|---|
| Navigation | One sidebar, two fixed groups: **Operation** and **Management** |
| Inside a topic | Sub-sections as tabs with their own URL |
| Create / edit | **List + own page**: the list shows, filters and runs quick actions (enable, test); "New" and "Edit" open the item's page (own URL, full form, ← Back, Save, Delete) |
| Old URLs | Permanent redirects |
| Visual style | Unchanged |
| Functionality | Unchanged, except: editing an existing source (missing today) |

## Information architecture

### Operation

| Screen | URL | Change |
|---|---|---|
| Dashboard | `/` | none (links updated) |
| Radar | `/radar` | none |
| Digests (archive) | `/digest`, `/digest/[id]` | none |
| Publications | `/posts` | none |
| Runs | `/runs`, `/runs/[id]`, **`/runs/new`** | the run dialog becomes the page `/runs/new`; the sidebar button links to it; "Run again" keeps working |

### Management

| Topic | Tabs | Pages |
|---|---|---|
| Sources | Sources · Categories | `/manage/sources` (list, category filter, enable toggle, test) · `/manage/sources/new` · `/manage/sources/[id]` (edit: name, URL, kind config, category; delete) · `/manage/categories` (list) · `/manage/categories/new` · `/manage/categories/[key]` |
| Digests | — | `/manage/digests` · `/manage/digests/new` · `/manage/digests/[key]` |
| Channels | — | `/manage/channels` · `/manage/channels/new` · `/manage/channels/[key]` |
| Writing | Voice · Prompts | `/manage/voice` (voice profile) · `/manage/prompts` (list) · `/manage/prompts/[key]` (editor) |
| Model | Provider · Credentials | `/manage/model` · `/manage/model/credentials` |
| Settings | Pipeline · Interface | `/manage/settings` (signals per week, ingest max age) · `/manage/settings/interface` (UI language) |

### Redirects (permanent)

`/sources` → `/manage/sources`; `/settings` → `/manage/voice`;
`/settings/channels` → `/manage/channels`; `/settings/digests` →
`/manage/digests`; `/settings/prompts` → `/manage/prompts`; `/settings/model` →
`/manage/model`. Implemented the way this Next.js version recommends (check
`node_modules/next/dist/docs/` — `redirects` in `next.config.ts` or equivalent).

## Components

- **`SectionTabs`** — tabs for a topic, `{ href, label }[]`, active by path;
  replaces `SettingsTabs`.
- **`Nav`** — two groups (Operation, Management) with the entries above; a topic
  is active for any path under it (e.g. `/manage/categories` highlights Sources).
- **List / form split** — each manager splits into a list component and a form
  component: `SourceList` + `SourceForm`, `CategoryList` + `CategoryForm`,
  `DigestDefList` + `DigestDefForm`, `ChannelList` + `ChannelForm`, `PromptList`
  + the existing `PromptEditor`, `VoiceForm` split into voice / pipeline /
  interface parts, `ModelForm` split into provider / credentials. Forms take
  `initial` + `isNew`; on save they navigate back to the list; delete asks for
  confirmation and goes back to the list. Unknown id/key → `notFound()`.
- **`/runs/new`** — the current `RunButton` dialog content as a page; the sidebar
  keeps a "Run pipeline" button that links there; the due-now hint and the
  definitions still come from the server.
- **New server action** `actionUpdateSource(id, input)` (name, url, kind config,
  category) with the same validation as `actionAddSource`.

## Constraints

- Client components never value-import modules that reach `getDb`.
- en/es dictionaries in sync (Spanish uses voseo); new keys for nav groups,
  tabs, page titles, "New …", "← Back".
- Every internal link and `revalidatePath` call points at the new URLs.
- Docs (`docs/configuring.md`, README, any screenshot text) use the new names
  and paths.

## Verification

- Typecheck, lint, tests, build.
- A small route test or script that requests every old URL and checks the
  redirect target, and every new page returns 200 on a temp database.
- Smoke test on a copy of the real DB: every page, create/edit/delete one item
  per topic, the run page runs a stage.
