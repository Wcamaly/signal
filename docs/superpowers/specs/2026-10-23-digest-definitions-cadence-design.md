# Digest definitions: cadence and monthly roll-ups

Date: 2026-10-23
Status: approved, ready for planning
Builds on: `2026-10-23-source-categories-design.md` (PR #8) — implement after it is merged.

## Problem

After PR #8 every digest is weekly: one general digest plus one per category
with its digest turned on. The user wants:

1. **Different cadences.** Some areas daily, others weekly.
2. **Combined roll-ups.** At the end of the month, one digest that pulls several
   of those together.

## Current state (verified against the code, PR #8 applied)

| Piece | Today |
|---|---|
| Item period | `items.week_key`, from `published_at` at ingest |
| Curation | `curateWeek(week)`: up to 120 items with status `new` **or `scored`** (re-scores every run), then resets and re-marks the top `signals_per_week` as `selected` |
| Digests | `digests` keyed `UNIQUE(week_key, category)`; `''` = general |
| Digest selection | general: `status = 'selected'`; category: top `digest_items` scored, not rejected |
| Category digest switch | `categories.digest_enabled`, `categories.digest_items` |
| Channel binding | `channels.category` (NULL = general) |
| Schedule | CronJob in `signal-deploy`, Mondays 08:00, `TZ=America/Argentina/Buenos_Aires`, `?week=previous` |
| Runs | `runs.week_key`, `runs.kind` = stages joined by `+` |

## Decisions

| Question | Decision |
|---|---|
| Where does "what and how often" live? | A new entity, the **digest definition** ("Resumen"). The general digest and every category digest become definitions |
| What feeds a monthly / combined digest? | The digests already written in that period, not the items again |
| Cadences | `daily`, `weekly`, `monthly` |
| Item selection for an item digest | `selected` items first (the curator's picks plus manual ones), then top scored to N; never `rejected` |
| Curation cost with a daily run | The curator scores only `new` items; it no longer re-scores |
| Where definitions are managed | Settings → Resúmenes (a tab like Channels) |
| Delivery | One spec, two plans: **phase 1** definitions + daily/weekly + daily cron + channels; **phase 2** roll-ups |

## 1. Digest definitions

```sql
CREATE TABLE IF NOT EXISTS digest_defs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,          -- stable slug; digests.def_key, channels.digest_def
  label TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'items', -- items | rollup
  cadence TEXT NOT NULL DEFAULT 'weekly', -- daily | weekly | monthly
  categories TEXT DEFAULT '[]',      -- items: JSON array of category keys; [] = every category
  sources TEXT DEFAULT '[]',         -- rollup: JSON array of digest_defs keys (kind = items only)
  item_count INTEGER DEFAULT 8,      -- items: top N (1..30)
  enabled INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 100,
  created_at TEXT DEFAULT (datetime('now'))
);
```

Rules:

- `general` always exists (seeded: items, weekly, all categories, `item_count`
  = the `signals_per_week` setting). It can be edited and disabled, not deleted.
- **Prompt by shape**, no per-definition prompt: items + no categories → `digest`;
  items + categories → `category_digest` (`{{category}}` = the labels joined);
  rollup → new `rollup_digest`.
- A rollup's sources must be `items` definitions (no roll-up of roll-ups) and its
  cadence must be longer than or equal to each source's (`monthly` over daily or
  weekly; `weekly` over daily). Validated on save.
- Deleting a definition: channels bound to it go back to `general` (NULL); its
  digests stay in the archive under its key; it is removed from every rollup's
  `sources`.
- A deleted category is removed from every definition's `categories`; a
  definition left with an empty list would silently become "all categories", so
  it is **disabled** instead and the run log says why.

Module `src/lib/digest-defs.ts` mirrors `categories.ts`: seed, get, save, delete,
label fallback, validation.

## 2. Periods

Module `src/lib/periods.ts`, pure and tested:

| Cadence | Period key | Range |
|---|---|---|
| daily | `2026-10-23` | that local day |
| weekly | `2026-W43` | ISO week (existing `weeks.ts` logic) |
| monthly | `2026-10` | that local month |

- `periodKey(cadence, date)`, `periodRange(key) → [start, end)`,
  `previousPeriod(cadence, now)`, `resolvePeriod(cadence, spec)` for
  `current | previous | <key>`.
- Day and month boundaries use the **process time zone** (`TZ`, already
  `America/Argentina/Buenos_Aires` in the cluster) — the same clock the cron uses.
- An item belongs to a period by `published_at` in range (weekly keeps using
  `items.week_key`, which is equivalent and indexed).

## 3. Schema changes and migration

**`digests`** rebuilt once more (same safe pattern as PR #8: foreign keys off
outside the transaction, ids copied, row count checked):

- new columns `def_key TEXT NOT NULL`, `period_key TEXT NOT NULL`;
- `UNIQUE (def_key, period_key)` replaces `UNIQUE (week_key, category)`;
- `week_key` and `category` are kept as plain columns (filled for weekly digests,
  for the radar/dashboard links and old rows) but are no longer the key.

Backfill: `category = ''` → `def_key = 'general'`; `category = X` → `def_key = X`;
`period_key = week_key`.

**Definitions from PR #8 data** (idempotent, on boot): for every category with
`digest_enabled = 1`, a definition `key = category.key`, items, weekly,
`categories = [key]`, `item_count = digest_items` — unless that key exists.
`categories.digest_enabled` / `digest_items` are then unused (left in place).

**`channels`**: `ensureColumn(channels, digest_def TEXT)`; backfill
`digest_def = category` where set. `channels.category` is unused afterwards.

**`runs`**: no schema change; `stats.digests` lists `{ def, period, digestId |
skipped | error }`.

## 4. Building a digest

`buildDigestFor(def, period, voice)` replaces `buildDigest` and
`buildCategoryDigest`:

- **items**: candidates = items in the period whose source is in
  `def.categories` (all if empty), `score IS NOT NULL`, `status != 'rejected'`;
  order `status = 'selected'` first, then score desc, then id; limit `item_count`.
  None → `{ skipped }`.
- **rollup** (phase 2): inputs = digests of `def.sources` whose period lies inside
  this period (daily: date in range; weekly: the ISO week's Thursday in range),
  ordered by period. None → `{ skipped }`. Payload per source digest: def label,
  period, title, subtitle, markdown (truncated per digest so the whole prompt
  stays under the current digest budget).
- Upsert by `(def_key, period_key)`; returns the id.
- Demo mode (no LLM) keeps the current filler style.

The general weekly definition therefore produces exactly today's general digest:
the curator's `selected` items, `signals_per_week` of them. One behaviour change:
a week with nothing scored used to fail the run ("No selected items"); it is now
a skipped digest with a warning, like every other definition.

## 5. Curation

`curateWeek` scores only `status = 'new'` items (still capped at 120 per run,
newest first) and then re-marks the week's top `signals_per_week` as before.
A daily run costs one pass over that day's new items instead of the whole week.
The curate stage curates the current week, and on Mondays also the previous
week so its last day's items are scored before the weekly digest.

## 6. Running

**Due definitions** for a run at time `now` (cron default):

| Cadence | Due when | Period built |
|---|---|---|
| daily | every run | previous day |
| weekly | Monday | previous week |
| monthly | day 1 | previous month |

Order: ingest → curate → item digests due → roll-ups due (phase 2) → posts.

**Posts**: channels bound to a definition whose digest was written **in this
run**, grouped by digest (generalises `groupChannelsByDigest`). A channel whose
definition was not due today writes nothing — that is not a warning. A due
definition that was skipped warns, as today.

**`/api/cron`** keeps `stages` and gains `defs=<key,key>` and `period=<spec>`
(applies to the listed defs); without them it runs what is due. `week=` keeps
working for the general weekly definition (backwards compatible with the current
CronJob until it is changed).

**Run dialog (UI)**: pick stages as today; for the digest stage, "what is due" or
one definition + period (`current`, `previous`, or a key).

**CronJob** (in `signal-deploy`, not this repo): schedule `0 8 * * *`, URL
`/api/cron` with no `week`. The public repo's `deploy/kubernetes/cronjob.yaml`
example changes the same way.

## 7. UI

- **Settings → Resúmenes** (`DigestDefManager`, like `ChannelManager`): label,
  kind, cadence, categories (multi-select) or sources (multi-select of item
  definitions), item count, enabled, order; delete (not for `general`).
- **Categories box**: the "Weekly digest" toggle and "Items" field are removed —
  that now lives in definitions. A short line points to Settings → Resúmenes.
- **`/digest`**: chips filter by definition; each card shows the definition label,
  cadence badge and period key.
- **`/digest/[id]`**: kicker `<period> · <definition>`.
- **Channel editor**: "Source digest" lists enabled definitions (plus the one
  bound), labelled with cadence.
- **Dashboard**: keeps showing the general definition's digest for the current
  week.
- i18n en/es for everything above.

## 8. Phases

**Phase 1** — definitions (items kind), `periods.ts` daily/weekly/monthly keys,
schema + migration, curator change, due-definition runner, posts by definition,
cron params, run dialog, Settings → Resúmenes (items only), archive/channel UI,
docs, public CronJob example.

**Phase 2** — `rollup` kind: `rollup_digest` prompt, source/cadence validation,
roll-up builder, roll-ups in the runner after item digests, Resúmenes UI for
sources, archive badges.

Each phase deploys on its own. After phase 1, change the cluster CronJob to daily.

## 9. Out of scope

- Custom schedules (specific weekdays, hours), several runs per day.
- Roll-ups of roll-ups.
- Per-definition prompt overrides.
- Back-filling digests for past periods automatically (doable by hand with
  `period=<key>`).

## 10. Verification

Vitest:

- `periods.ts`: keys and ranges for daily/weekly/monthly across month/year
  boundaries and ISO week 53; `previousPeriod`; a fixed `TZ` in the test.
- Migration: legacy `digests` (PR #8 shape) with posts → same ids, posts intact,
  `def_key`/`period_key` backfilled, new unique key enforced; definitions created
  from `digest_enabled` categories; `channels.digest_def` backfilled.
- Selection: selected-first ordering, rejected excluded, category filter, daily
  range by `published_at`.
- Due definitions for a Monday, a day 1, and an ordinary day.
- Posts grouping: channel of a non-due definition writes nothing and logs nothing;
  due-but-skipped warns.
- Phase 2: roll-up input selection (daily in month, ISO weeks by Thursday),
  validation rejects roll-up of roll-up and shorter cadence.

Manual, on a copy of the real DB in demo mode: daily run on an ordinary day,
a Monday, and a 1st (via `period=` / a faked `now` in a test), checking the
archive, channels and run log.
