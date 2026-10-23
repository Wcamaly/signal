# Source categories, per-category digests and category channels

Date: 2026-10-23
Status: approved, ready for planning

## Problem

Sources already carry a category, but it is a label and nothing more:

1. **Categories cannot be managed.** The list is hard-coded. You cannot add
   "robotics", rename "press" or drop "business" from the UI.
2. **Nothing filters by category.** Radar, sources and digests show everything
   at once.
3. **There is one digest per week.** A niche area (regulation, research) only
   appears if its items beat everything else in the global curation, and a
   channel aimed at that niche has nothing of its own to write from.

## Current state (verified against the code)

| Piece | Today |
|---|---|
| Category on a source | `sources.category TEXT DEFAULT 'general'`, free text (`src/lib/db.ts`) |
| Category list | `SOURCE_CATEGORIES` constant, 9 values (`src/lib/sources/seed.ts`) |
| Sources page | `SourceManager.tsx` groups by category; the add form picks one from the constant |
| Radar | Query joins `s.category AS source_category`; no filter on it |
| Digests | `digests.week_key TEXT NOT NULL UNIQUE` — one per week |
| Digest lookups by week | `agents/digest.ts` (upsert + reselect), `pipeline.ts` (posts stage), `app/page.tsx` (dashboard) |
| Posts | `writePosts(digestId, voice, channels)` — every channel writes from the one digest |
| Foreign keys | better-sqlite3 enables them by default; `posts.digest_id` is `ON DELETE CASCADE` |
| Tests | vitest; `db.test.ts` already exercises a migration against a legacy-shaped file |

## Decisions

| Question | Decision |
|---|---|
| What is a "summary per category"? | A separate digest per category per week, alongside the general one |
| Which categories get one? | Opt-in, per category (`digest_enabled`) |
| Which items feed it? | The top N scored items of that category in the week, selected or not. N per category, default 8 |
| Do category digests produce posts? | Yes: a channel can be bound to a category and writes from that category's digest |
| Channel bound to a category with no digest this week | Skipped with a warning in the run log. No fallback to the general digest |
| Data model | A `categories` table keyed by a stable slug; `sources.category` keeps storing the slug |
| Where categories are managed | A "Categories" section on `/sources` |

## 1. Data model

### `categories` (new)

```sql
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,          -- stable slug, stored in sources.category and channels.category
  label TEXT NOT NULL,
  color TEXT DEFAULT '#8b93a1',
  digest_enabled INTEGER DEFAULT 0,  -- build a weekly digest for this category
  digest_items INTEGER DEFAULT 8,    -- top N scored items that feed it
  sort_order INTEGER DEFAULT 100,
  created_at TEXT DEFAULT (datetime('now'))
);
```

Same pattern as `channels.key` ↔ `posts.platform`: the slug never changes,
renaming only touches `label`. No `sources` row is migrated.

**Seeding** (`seedCategories()`, idempotent, runs where `seedSources()` runs):
insert one row for each value of `SOURCE_CATEGORIES` and for each
`DISTINCT sources.category` not already present. Label = the key with its first
letter upper-cased. `INSERT OR IGNORE`, so user edits are never overwritten.
`SOURCE_CATEGORIES` stays only as seed data.

`general` is protected: it cannot be deleted (it is where orphaned sources go),
but it can be renamed and recoloured.

### `digests` (rebuilt)

New column `category TEXT NOT NULL DEFAULT ''`, where `''` is the general
digest. The unique constraint moves from `(week_key)` to `(week_key, category)`.
`''` rather than `NULL` because SQLite treats NULLs as distinct in a UNIQUE
index, which would let two general digests exist for the same week.

SQLite cannot alter a table constraint, so the table is rebuilt once, guarded by
"`category` column is missing":

1. `PRAGMA foreign_keys = OFF` — **required**. With foreign keys on, dropping
   `digests` cascades into `posts` and deletes every post.
2. In a transaction: create `digests_new` with the new shape, copy every row
   **keeping `id`**, drop `digests`, rename `digests_new` → `digests`.
3. Before the drop, the new table must hold as many rows as the old one, or the
   transaction aborts. (Not `PRAGMA foreign_key_check`: it also flags unrelated
   old dangling references and would stop the app from booting.) Then
   `PRAGMA foreign_keys = ON`.

`posts.digest_id` keeps pointing at the same ids, so nothing else changes.

### `channels`

`ensureColumn(db, "channels", "category", "TEXT")` — `NULL` = writes from the
general digest; a slug = writes from that category's digest.

### Types

`Category` type in `src/lib/types.ts`; `Channel` gains `category: string | null`;
digest rows gain `category: string`.

## 2. Managing categories

New module `src/lib/categories.ts` (mirrors `channels.ts`):

- `getCategories()` — ordered by `sort_order, label`.
- `getCategory(key)`.
- `saveCategory(input)` — insert or update by `key`. The key is slugified from the
  label on creation and is read-only afterwards. `digest_items` clamped to 1..30.
- `deleteCategory(key)` — refuses `general`. In one transaction:
  `UPDATE sources SET category = 'general' WHERE category = ?`,
  `UPDATE channels SET category = NULL WHERE category = ?`, then delete the row.
  Existing digests of that category are kept; the UI falls back to showing the key
  when no category row matches.

Server actions in `actions.ts`: `actionSaveCategory`, `actionDeleteCategory`,
`actionSetSourceCategory(id, key)` (change the category of an existing source —
today it can only be chosen on creation). All revalidate `/sources`, `/radar`,
`/digest`.

UI: a `CategoryManager` component in a "Categories" section on `/sources`, above
the source list: one row per category with label, colour, digest toggle, N, sort
order, delete. `SourceManager` receives `Category[]` instead of `string[]`,
shows labels and colours, and gets a category select on each source row.

## 3. Filters

All filters are `?cat=<key>` chips, plain links like the existing week and score
chips; "All" clears it.

- **`/sources`** — filters the list; grouping by category stays.
- **`/radar`** — adds `AND s.category = ?` when set; composes with `week` and
  `min` (each chip link preserves the other params).
- **`/digest`** — chips "General" (`cat=` empty string → `category = ''`) and one per
  category; no param shows all. Each card shows a category badge (label + colour)
  when `category != ''`.

## 4. Per-category digests

`buildCategoryDigest(week, category: Category, voice)` in `agents/digest.ts`:

```sql
SELECT i.* FROM items i JOIN sources s ON s.id = i.source_id
WHERE i.week_key = ? AND s.category = ? AND i.score IS NOT NULL
ORDER BY i.score DESC LIMIT ?
```

- No rows → returns `{ skipped: true }`, no throw.
- Uses a new prompt key `category_digest` (registered in `prompts.ts`, editable
  under Prompts) with the same variables as `digest` plus `{{category}}` (the
  label). The existing `digest` prompt is untouched: user overrides are never
  migrated.
- Demo mode (no LLM) mirrors `buildDigest`'s fallback, titled
  `<label> — <week>`.
- Upsert `ON CONFLICT(week_key, category)`; reselect by both columns.

`buildDigest` (general) writes `category = ''` and its conflict target becomes
`(week_key, category)`.

Selection of the top N is pulled into a pure-ish helper
(`categoryDigestItems(db, week, key, n)`) so it can be tested directly.

**Pipeline, digest stage:** build the general digest as today, then for each
category with `digest_enabled = 1`, `buildCategoryDigest`. Log one line per
category (`Digest "<label>": N signals.` or `⚠ Digest "<label>" skipped: no scored
items this week.`). Stats gain `categoryDigests: { key, items | skipped }[]`.
A failure in one category digest is logged as a warning and does not fail the
run; a failure in the general digest still fails it, as today.

## 5. Channels bound to a category

- Channel form (`ChannelManager.tsx`): "Source digest" select — General, or any
  category. Saved through `ChannelInput.category`.
- **Pipeline, posts stage:** group enabled channels by `category ?? ''`. For each
  group, look up `SELECT id FROM digests WHERE week_key = ? AND category = ?`.
  - Found → `writePosts(digestId, voice, groupChannels)`.
  - Missing, general group → throw, as today ("There is no digest for <week> yet.").
  - Missing, category group → `⚠ Channels <labels> skipped: no "<category>" digest for <week>.`
- `writePosts` is unchanged. Stats `posts` sum across groups.

The `digestId` returned by the digest stage is no longer threaded through; the
posts stage always looks the digests up, which also covers runs with only the
posts stage.

## 6. Other `week_key` lookups

Every query that finds "the digest of a week" must add `AND category = ''`:
`app/page.tsx` (dashboard) and the reselects in `agents/digest.ts`. The dashboard
otherwise keeps showing only the general digest.

`app/digest/[id]/page.tsx` shows the category badge and, for category digests,
a link back to `/digest?cat=<key>`.

## 7. i18n

New strings in `src/lib/i18n/en.ts` and `es.ts`: categories section (title,
fields, delete confirmation, "general cannot be deleted"), filter "All" /
"General", channel "Source digest" field, digest badge. Category labels are user
data and are not translated.

## 8. Implementation order

1. Schema: `categories` table + seed, `channels.category`, `digests` rebuild — with tests.
2. `categories.ts` + actions + `CategoryManager` + source category select.
3. Filters on `/sources`, `/radar`, `/digest`.
4. `category_digest` prompt + `buildCategoryDigest` + digest stage.
5. Channel binding + posts stage grouping.
6. i18n strings, docs (`docs/configuring.md` section on categories).

## 9. Out of scope

- Hierarchical categories / several categories per source.
- Category-specific curation (the curator still scores the whole week at once;
  per-category digests reuse its scores).
- Falling back to the general digest for a category channel.
- A separate `signals_per_week` per category for the global selection.

## 10. Verification

Vitest:

- **Digest rebuild:** a legacy-shaped file with digests and posts referencing them
  → after `getDb()`, same digest ids, all posts present, `category = ''` on old
  rows, a second general digest for the same week is rejected, a category digest
  for the same week is accepted.
- **Category seed:** existing `sources.category` values not in the constant get a
  row; re-running does not overwrite an edited label.
- **`deleteCategory`:** sources move to `general`, channels to `NULL`, `general`
  refuses deletion.
- **`categoryDigestItems`:** respects week, category, N, ignores unscored items,
  includes non-selected items.
- **Posts grouping:** a category channel with no digest is skipped and logged; a
  general channel with no digest still errors.

Manual: create a category, move two sources into it, enable its digest, run
ingest + curate + digest, bind a channel, run posts; check radar/sources/digest
filters in both UI languages.
