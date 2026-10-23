# Digest definitions, phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Digest definitions ("Resúmenes") with daily, weekly and monthly cadence, a daily run that writes whatever is due, channels bound to a definition, and the UI to manage and browse them. Roll-ups are phase 2.

**Architecture:** A `digest_defs` table keyed by a stable slug (same pattern as `categories.key`). `digests` is rebuilt once more to `UNIQUE(def_key, period_key)` (foreign keys off, ids copied, row count checked — the PR #8 pattern), with `week_key` kept for weekly rows. A pure `periods.ts` names and bounds days, ISO weeks and months in the process time zone. `buildDigestFor(def, period, voice)` replaces the two old builders. The pipeline resolves a list of *targets* (definition + period) — what is due at `now`, named `defs` + `period`, the legacy `week`, or exact pairs on "Run again" — and the posts stage writes only for channels bound to a target's definition. The schema already carries `kind` and `sources`, so phase 2 adds code only.

**Tech Stack:** Next.js 16 App Router (server components + server actions), better-sqlite3, vitest, Tailwind. Spec: `docs/superpowers/specs/2026-10-23-digest-definitions-cadence-design.md` (section 8, phase 1).

---

## Before you start

- Branch: `feat/digest-definitions`, already checked out. It is stacked on `feat/source-categories-impl` (PR #8, not merged yet): rebase onto `main` once PR #8 lands. Do not push unless asked.
- `AGENTS.md`: this Next.js differs from your training data. Nothing here uses a new Next API — every page and action copies a pattern already in the repo (`searchParams` as a `Promise`, `"use server"` actions in `src/lib/actions.ts`, `revalidatePath`, `export const dynamic = "force-dynamic"`). If you need anything beyond that, read `node_modules/next/dist/docs/01-app/` first.
- Client components must never import a runtime value from a module that imports `getDb` (it would bundle better-sqlite3 into the browser). `import type` is fine. `src/lib/periods.ts` and `src/lib/weeks.ts` are pure and may be value-imported by client components; `src/lib/digest-defs.ts`, `src/lib/categories.ts` and `src/lib/pipeline.ts` may not (types only).
- `src/lib/i18n/es.ts` is typed as `Dictionary`: every key added to or removed from `en.ts` must change in `es.ts` in the same task or typecheck fails. The Spanish copy uses *voseo* ("Agregá", "Ejecutalas", "elijas") — match it.
- Check command for every task: `npm run lint && npm run typecheck && npm test`.
- Leave `.serena/project.yml` out of every commit (it is modified in the working tree and not ours). Stage files by name, never `git add -A`.
- Never run `npm run dev` / `next dev` against `data/signal.db`. Tests use a temporary `SIGNAL_DATA_DIR`; manual checks use a copy (Task 12 shows how).
- Time zones: day and month boundaries use the process `TZ`. Every test that builds a period sets `process.env.TZ = "America/Argentina/Buenos_Aires"` at the top of the file, before any `Date` is built (Node applies a runtime change of `TZ`).
- Tests that build digests or run the pipeline delete the LLM key variables from `process.env` at the top of the file, so they run in demo mode even in a shell that exports `ANTHROPIC_API_KEY`.

### Decisions this plan makes where the spec is open

1. **Roll-ups are refused on save in phase 1** (`saveDigestDef` throws for `kind: "rollup"`); `buildDigestFor` and `resolveTargets` also throw for a non-`items` definition as a guard. The columns exist, so phase 2 only adds code.
2. **The legacy migration runs once**, when `digest_defs` is empty (first boot with this code). It creates `general` (weekly, all categories, `item_count = signals_per_week`), one weekly definition per category with `digest_enabled = 1`, and — so a channel bound to a category whose digest was *off* keeps writing nothing instead of silently switching to the general digest — a **disabled** definition for such categories. Running only once means a definition deleted later is never resurrected from the still-present `categories.digest_enabled`.
3. **A category whose key is `general`** maps to definition key `general-category` (in the `digests` backfill, the definitions and the channel backfill). Without this, a PR #8 database with a digest-enabled category called `general` would fail the rebuild on `UNIQUE(def_key, period_key)` and the app would not boot.
4. **`digests.category` keeps being written** (`''` for `general`, otherwise the definition key) and `week_key` is filled only for weekly periods (the column becomes nullable). Nothing reads `category` after Task 10.
5. **"Written in this run" and the run dialog.** The dialog runs one stage per call, so a posts-only call has no digests "written in this run". The posts stage therefore takes the *targets* of the run: when the digest stage ran in the same call it uses exactly what it wrote (skipped/failed → warning), otherwise it looks up the stored digest of each target (missing → warning). Channels of a definition that is not a target write nothing and log nothing.
6. **`period` defaults to `previous`** when `defs` is given (the closed period); `period` without `defs` is refused with a 400-style error. Named definitions run even when disabled.
7. **Legacy `week=`** writes *every enabled weekly definition* for that week (a superset of "the general weekly definition": it is exactly what PR #8's `?week=previous` did) and curates only that week.
8. **A failing digest is a warning; the run fails only if every target failed.** A skipped digest (nothing scored) is a warning, never a failure — the spec's one behaviour change.
9. **Curation never re-selects a rejected item and leaves `used` items `used`.** With a daily run the re-marking happens every day, and the current query would turn a rejected item back into `selected`. `used` items still count towards `signals_per_week`, and item digests rank `selected` and `used` first.
10. **"The run log says why" a definition was disabled by a category deletion** is not possible — no run is involved. Instead the delete confirmation says so and Settings → Digests shows the definition as disabled. `deleteCategory()` returns the disabled labels for whoever wants to surface them later.
11. **"Run again"** replays `stats.targets` (stored on every new run). Runs recorded before this change have no `targets` and replay as the legacy weekly run of their `week_key`.

## File map

| File | Change |
|---|---|
| `src/lib/periods.ts` (new) | cadences, period keys and ranges, `previousPeriod`, `resolvePeriod`, `isDue`, `periodWeeks` |
| `src/lib/periods.test.ts` (new) | |
| `src/lib/db.ts` | `digest_defs` table, `channels.digest_def`, new `digests` DDL, `migrateDigests()` (replaces `migrateDigestCategory`), `seedLegacyDigestDefs()`, `legacyDefKey()` |
| `src/lib/db.test.ts` | rebuild from both legacy shapes, legacy definitions, schema |
| `src/lib/types.ts` | `DigestDef`, `DigestKind`, `Digest.def_key/period_key`, `Channel.digest_def` (drops `Channel.category`, `Category.digest_*`) |
| `src/lib/slug.ts` (new) | `slugify`, moved out of `categories.ts` so `digest-defs.ts` needs no import cycle |
| `src/lib/digest-defs.ts` (new) | seed, get, save, delete, `digestDefLabel`, `removeCategoryFromDefs` |
| `src/lib/digest-defs.test.ts` (new) | |
| `src/lib/categories.ts` | `deleteCategory` updates definitions; digest fields dropped (Task 11) |
| `src/lib/agents/digest.ts` | `saveDigest(defKey, periodKey, …)`, `digestItems`, `buildDigestFor` |
| `src/lib/agents/digest.test.ts` | |
| `src/lib/agents/curator.ts`, `curator.test.ts` (new) | scores `new` only; never re-selects rejected |
| `src/lib/agents/writer.ts` | `{{week}}` from `period_key` |
| `src/lib/prompts.ts` | descriptions; `week` and `category` variable docs |
| `src/lib/channels.ts`, `channels.test.ts` (new) | `digest_def` replaces `category` |
| `src/lib/pipeline.ts`, `pipeline.test.ts` | targets, due, curate weeks, posts by target |
| `src/app/api/cron/route.ts` | `defs`, `period`, legacy `week` |
| `src/lib/actions.ts` | relaunch replays targets; definition actions |
| `src/app/runs/[id]/page.tsx` | stats lists render one row per entry |
| `src/components/RunButton.tsx`, `src/app/layout.tsx` | due vs one definition + period |
| `src/components/DigestDefManager.tsx` (new), `src/app/settings/digests/page.tsx` (new), `SettingsTabs.tsx`, `Nav.tsx` | Settings → Digests |
| `src/components/ChannelManager.tsx`, `src/app/settings/channels/page.tsx` | source digest = a definition |
| `src/app/digest/page.tsx`, `src/app/digest/[id]/page.tsx`, `src/app/page.tsx` | archive by definition; dashboard reads `general` |
| `src/components/CategoryManager.tsx` | digest toggle removed, pointer to Settings → Digests |
| `src/lib/i18n/en.ts`, `src/lib/i18n/es.ts` | strings |
| `docs/configuring.md`, `docs/deploying.md`, `README.md` | docs |
| `deploy/kubernetes/cronjob.yaml`, `deploy/signal-pipeline.service`, `deploy/signal-pipeline.timer`, `docker-compose.yml` | daily schedule, no `week` |

---

### Task 1: Periods

**Files:**
- Create: `src/lib/periods.ts`
- Test: `src/lib/periods.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/periods.test.ts`:

```ts
import { describe, expect, it } from "vitest";

// Day and month boundaries follow the process time zone. Pin the one the
// cluster runs in, before any Date is built, so the test means the same thing
// on every machine.
process.env.TZ = "America/Argentina/Buenos_Aires";

const { cadenceOf, isDue, isPeriodKey, periodKey, periodRange, periodWeeks, previousPeriod, resolvePeriod } =
  await import("./periods");

/** Local midday, so no offset can push the date to another day. */
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0);

describe("periodKey", () => {
  it("names the local day, ISO week and month", () => {
    expect(periodKey("daily", at(2026, 10, 23))).toBe("2026-10-23");
    expect(periodKey("weekly", at(2026, 10, 23))).toBe("2026-W43");
    expect(periodKey("monthly", at(2026, 10, 23))).toBe("2026-10");
  });

  it("uses the local date, not UTC: 23:30 in Buenos Aires is already tomorrow in UTC", () => {
    const late = new Date(2026, 9, 31, 23, 30);
    expect(late.toISOString().slice(0, 10)).toBe("2026-11-01");
    expect(periodKey("daily", late)).toBe("2026-10-31");
    expect(periodKey("monthly", late)).toBe("2026-10");
  });
});

describe("cadenceOf / isPeriodKey", () => {
  it("recognises each shape", () => {
    expect(cadenceOf("2026-10-23")).toBe("daily");
    expect(cadenceOf("2026-W43")).toBe("weekly");
    expect(cadenceOf("2026-10")).toBe("monthly");
  });

  it("rejects dates and weeks that do not exist", () => {
    expect(cadenceOf("2026-02-30")).toBeNull();
    expect(cadenceOf("2026-13")).toBeNull();
    expect(cadenceOf("2025-W53")).toBeNull(); // 2025 has 52 ISO weeks
    expect(cadenceOf("2026-W53")).toBe("weekly"); // 2026 has 53
    expect(cadenceOf("previous")).toBeNull();
  });

  it("checks the key against the cadence", () => {
    expect(isPeriodKey("daily", "2026-10-23")).toBe(true);
    expect(isPeriodKey("weekly", "2026-10-23")).toBe(false);
  });
});

describe("periodRange", () => {
  it("covers one local day", () => {
    const { start, end } = periodRange("2026-10-23");
    expect(start).toEqual(new Date(2026, 9, 23));
    expect(end).toEqual(new Date(2026, 9, 24));
    expect(start.toISOString()).toBe("2026-10-23T03:00:00.000Z");
  });

  it("crosses the end of a month and of a year", () => {
    expect(periodRange("2026-10-31").end).toEqual(new Date(2026, 10, 1));
    expect(periodRange("2026-12-31").end).toEqual(new Date(2027, 0, 1));
  });

  it("covers the ISO week from Monday to Monday", () => {
    expect(periodRange("2026-W43")).toEqual({ start: new Date(2026, 9, 19), end: new Date(2026, 9, 26) });
  });

  it("handles ISO week 1 starting in December and week 53", () => {
    expect(periodRange("2026-W01").start).toEqual(new Date(2025, 11, 29));
    expect(periodRange("2026-W53")).toEqual({ start: new Date(2026, 11, 28), end: new Date(2027, 0, 4) });
  });

  it("covers the month", () => {
    expect(periodRange("2026-12")).toEqual({ start: new Date(2026, 11, 1), end: new Date(2027, 0, 1) });
    expect(periodRange("2028-02").end).toEqual(new Date(2028, 2, 1));
  });

  it("refuses an unknown key", () => {
    expect(() => periodRange("nope")).toThrow(/Unknown period/);
  });
});

describe("previousPeriod", () => {
  it("is yesterday, last week and last month", () => {
    expect(previousPeriod("daily", at(2026, 10, 23))).toBe("2026-10-22");
    expect(previousPeriod("weekly", at(2026, 10, 26))).toBe("2026-W43");
    expect(previousPeriod("monthly", at(2026, 11, 1))).toBe("2026-10");
  });

  it("crosses the year backwards", () => {
    expect(previousPeriod("daily", at(2027, 1, 1))).toBe("2026-12-31");
    expect(previousPeriod("weekly", at(2027, 1, 4))).toBe("2026-W53");
    expect(previousPeriod("monthly", at(2027, 1, 1))).toBe("2026-12");
  });

  it("is the day that just closed for a run at 08:00", () => {
    expect(previousPeriod("daily", at(2026, 11, 1, 8))).toBe("2026-10-31");
  });
});

describe("resolvePeriod", () => {
  const now = at(2026, 10, 23);

  it("defaults to the previous period", () => {
    expect(resolvePeriod("daily", undefined, now)).toBe("2026-10-22");
    expect(resolvePeriod("weekly", "previous", now)).toBe("2026-W42");
  });

  it("resolves current and accepts an explicit key", () => {
    expect(resolvePeriod("monthly", "current", now)).toBe("2026-10");
    expect(resolvePeriod("daily", "2026-09-01", now)).toBe("2026-09-01");
  });

  it("refuses a key of another cadence", () => {
    expect(() => resolvePeriod("daily", "2026-W43", now)).toThrow('Unknown daily period "2026-W43"');
  });
});

describe("isDue", () => {
  it("runs daily every day, weekly on Monday, monthly on the 1st", () => {
    const ordinary = at(2026, 10, 22); // Thursday
    const monday = at(2026, 10, 26);
    const first = at(2026, 11, 1); // Sunday
    expect([isDue("daily", ordinary), isDue("weekly", ordinary), isDue("monthly", ordinary)]).toEqual([
      true,
      false,
      false,
    ]);
    expect(isDue("weekly", monday)).toBe(true);
    expect([isDue("monthly", first), isDue("weekly", first)]).toEqual([true, false]);
  });
});

describe("periodWeeks", () => {
  it("is the week itself, the week of a day, and every week a month touches", () => {
    expect(periodWeeks("2026-W43")).toEqual(["2026-W43"]);
    expect(periodWeeks("2026-10-25")).toEqual(["2026-W43"]);
    expect(periodWeeks("2026-10")).toEqual(["2026-W40", "2026-W41", "2026-W42", "2026-W43", "2026-W44"]);
  });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run src/lib/periods.test.ts`
Expected: FAIL — `Error: Cannot find module '/src/lib/periods'`.

- [ ] **Step 3: Implement**

Create `src/lib/periods.ts`:

```ts
/**
 * The calendar units a digest definition can run on. A period key names one
 * concrete period: `2026-10-23` (a day), `2026-W43` (an ISO week) or `2026-10`
 * (a month). Day and month boundaries follow the process time zone (`TZ`) —
 * the same clock the schedule fires on — exactly like `weekKey()` does.
 *
 * Pure: no database, so client components may import it.
 */
import { isWeekKey, previousWeekKey, weekKey, type WeekKey } from "./weeks";

export type Cadence = "daily" | "weekly" | "monthly";

export const CADENCES: Cadence[] = ["daily", "weekly", "monthly"];

/** `2026-10-23`, `2026-W43` or `2026-10`. */
export type PeriodKey = string;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;
const WEEK_RE = /^(\d{4})-W(\d{2})$/;

const pad = (n: number) => String(n).padStart(2, "0");

export function isCadence(value: unknown): value is Cadence {
  return typeof value === "string" && (CADENCES as string[]).includes(value);
}

/** The period of that cadence an instant falls in, by the local calendar. */
export function periodKey(cadence: Cadence, d: Date = new Date()): PeriodKey {
  if (cadence === "weekly") return weekKey(d);
  const month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  return cadence === "monthly" ? month : `${month}-${pad(d.getDate())}`;
}

/** Which cadence a key belongs to, or null when it is not a valid key. */
export function cadenceOf(key: string): Cadence | null {
  const day = DAY_RE.exec(key);
  if (day) {
    const [y, m, d] = [Number(day[1]), Number(day[2]), Number(day[3])];
    const date = new Date(y, m - 1, d);
    // Rejects 2026-02-30, which Date would quietly roll into March.
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? "daily" : null;
  }
  const week = WEEK_RE.exec(key);
  if (week) {
    const w = Number(week[2]);
    if (w < 1 || w > 53) return null;
    // Week 53 exists only in some years: it must map back onto itself.
    return weekKey(isoWeekStart(Number(week[1]), w)) === key ? "weekly" : null;
  }
  const month = MONTH_RE.exec(key);
  if (month) {
    const m = Number(month[2]);
    return m >= 1 && m <= 12 ? "monthly" : null;
  }
  return null;
}

export function isPeriodKey(cadence: Cadence, value: unknown): value is PeriodKey {
  return typeof value === "string" && cadenceOf(value) === cadence;
}

/** Local midnight of the Monday that opens ISO week `w` of ISO year `y`. */
function isoWeekStart(y: number, w: number): Date {
  // 4 January is always in ISO week 1.
  const jan4 = new Date(y, 0, 4);
  const dow = jan4.getDay() || 7;
  return new Date(y, 0, 4 - dow + 1 + (w - 1) * 7);
}

/**
 * `[start, end)` of a period, both at local midnight. Built from calendar
 * fields, never by adding milliseconds, so a daylight saving change cannot
 * shift a boundary by an hour.
 */
export function periodRange(key: PeriodKey): { start: Date; end: Date } {
  const cadence = cadenceOf(key);
  if (cadence === "daily") {
    const [, y, m, d] = DAY_RE.exec(key)!.map(Number);
    return { start: new Date(y, m - 1, d), end: new Date(y, m - 1, d + 1) };
  }
  if (cadence === "weekly") {
    const [, y, w] = WEEK_RE.exec(key)!.map(Number);
    const start = isoWeekStart(y, w);
    return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7) };
  }
  if (cadence === "monthly") {
    const [, y, m] = MONTH_RE.exec(key)!.map(Number);
    return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
  }
  throw new Error(`Unknown period "${key}".`);
}

/** The period of that cadence that closed most recently. */
export function previousPeriod(cadence: Cadence, now: Date = new Date()): PeriodKey {
  if (cadence === "weekly") return previousWeekKey(now);
  if (cadence === "monthly") return periodKey("monthly", new Date(now.getFullYear(), now.getMonth() - 1, 1));
  return periodKey("daily", new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
}

/** `current`, `previous` (also the default) or a key of that cadence. */
export function resolvePeriod(cadence: Cadence, spec: string | null | undefined, now: Date = new Date()): PeriodKey {
  const value = (spec ?? "").trim();
  if (!value || value === "previous") return previousPeriod(cadence, now);
  if (value === "current") return periodKey(cadence, now);
  if (isPeriodKey(cadence, value)) return value;
  throw new Error(
    `Unknown ${cadence} period "${value}". Use "current", "previous" or a key such as ${periodKey(cadence, now)}.`,
  );
}

/**
 * Whether a definition of that cadence is due in a run at `now`: daily every
 * day, weekly on Monday, monthly on the 1st — each for the period that just
 * closed.
 */
export function isDue(cadence: Cadence, now: Date = new Date()): boolean {
  if (cadence === "weekly") return now.getDay() === 1;
  if (cadence === "monthly") return now.getDate() === 1;
  return true;
}

/** Every ISO week a period touches, in order. Tells curation what to score. */
export function periodWeeks(key: PeriodKey): WeekKey[] {
  if (isWeekKey(key)) return [key];
  const { start, end } = periodRange(key);
  const weeks: WeekKey[] = [];
  for (let d = start; d < end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const w = weekKey(d);
    if (!weeks.includes(w)) weeks.push(w);
  }
  return weeks;
}
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run src/lib/periods.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 5: Full check and commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all green.

```bash
git add src/lib/periods.ts src/lib/periods.test.ts
git commit -m "feat: periods — daily, weekly and monthly keys and ranges"
```

---

### Task 2: Schema — digest_defs, channels.digest_def, digests keyed by definition and period

This task changes the unique key of `digests`, so it also updates **every** `ON CONFLICT` target and every lookup that used `(week_key, category)` — `saveDigest`, `groupChannelsByDigest`, the dashboard — in the same commit. The old builders and the old pipeline keep working on top of the new key until Tasks 4 and 7 replace them.

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/channels.ts` (only `channelLabel`'s fallback)
- Modify: `src/lib/agents/digest.ts` (only `saveDigest` and its two callers)
- Modify: `src/lib/agents/writer.ts`
- Modify: `src/lib/pipeline.ts` (only `PostGroup` / `groupChannelsByDigest`)
- Modify: `src/app/page.tsx`
- Test: `src/lib/db.test.ts`, `src/lib/agents/digest.test.ts`, `src/lib/pipeline.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/db.test.ts`, change the import line:

```ts
const { getDb, legacyDefKey, migrateDigests, seedLegacyDigestDefs } = await import("./db");
```

Replace the whole `describe("digests.category rebuild", …)` block **and the comment above it** (from `/**` ``* `digests.week_key` was UNIQUE on its own.`` down to the line before `describe("category schema"`) with:

```ts
/**
 * The digests' unique key moves to (def_key, period_key). That means
 * rebuilding the table, and `posts.digest_id` is ON DELETE CASCADE: dropping
 * the old table with foreign keys on deletes every post. These run against
 * files shaped like the two older databases: before categories (week_key
 * UNIQUE) and after them (UNIQUE week_key, category).
 */
describe("digests rebuild", () => {
  const POSTS = `
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      digest_id INTEGER REFERENCES digests(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      body TEXT NOT NULL
    );`;

  const beforeCategories = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-digests-"));
    const raw = new Database(path.join(dir, "signal.db"));
    raw.exec(`
      CREATE TABLE digests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        week_key TEXT NOT NULL UNIQUE,
        title TEXT, subtitle TEXT, markdown TEXT, item_ids TEXT,
        status TEXT DEFAULT 'draft', model TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        language TEXT
      );
      ${POSTS}
      INSERT INTO digests (id, week_key, title, language) VALUES (7, '2026-W40', 'Old', 'English'), (9, '2026-W41', 'Older', NULL);
      INSERT INTO posts (digest_id, platform, body) VALUES (7, 'x', 'a'), (7, 'linkedin', 'b'), (9, 'x', 'c');
    `);
    return raw;
  };

  const withCategories = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-digests-"));
    const raw = new Database(path.join(dir, "signal.db"));
    raw.exec(`
      CREATE TABLE digests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        week_key TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT '',
        title TEXT, subtitle TEXT, markdown TEXT, item_ids TEXT,
        status TEXT DEFAULT 'draft', model TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        language TEXT,
        UNIQUE (week_key, category)
      );
      ${POSTS}
      INSERT INTO digests (id, week_key, category, title) VALUES
        (3, '2026-W42', '', 'G'), (4, '2026-W42', 'regulation', 'R'), (5, '2026-W42', 'general', 'GC');
      INSERT INTO posts (digest_id, platform, body) VALUES (3, 'x', 'a'), (4, 'policy', 'b'), (5, 'x', 'c');
    `);
    return raw;
  };

  it("starts with foreign keys on, which is what makes the rebuild dangerous", () => {
    expect(beforeCategories().pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("keeps every digest id, its data and every post — from before categories", () => {
    const db = beforeCategories();
    migrateDigests(db);
    expect(
      db.prepare("SELECT id, def_key, period_key, week_key, category, title, language FROM digests ORDER BY id").all(),
    ).toEqual([
      { id: 7, def_key: "general", period_key: "2026-W40", week_key: "2026-W40", category: "", title: "Old", language: "English" },
      { id: 9, def_key: "general", period_key: "2026-W41", week_key: "2026-W41", category: "", title: "Older", language: null },
    ]);
    expect((db.prepare("SELECT COUNT(*) c FROM posts").get() as { c: number }).c).toBe(3);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("maps each category digest to the definition of the same key — from after categories", () => {
    const db = withCategories();
    migrateDigests(db);
    expect(db.prepare("SELECT id, def_key, period_key, category FROM digests ORDER BY id").all()).toEqual([
      { id: 3, def_key: "general", period_key: "2026-W42", category: "" },
      { id: 4, def_key: "regulation", period_key: "2026-W42", category: "regulation" },
      // A category called "general" must not collide with the general digest.
      { id: 5, def_key: "general-category", period_key: "2026-W42", category: "general" },
    ]);
    expect((db.prepare("SELECT COUNT(*) c FROM posts").get() as { c: number }).c).toBe(3);
  });

  it("allows one digest per definition and period", () => {
    const db = beforeCategories();
    migrateDigests(db);
    db.prepare("INSERT INTO digests (def_key, period_key, title) VALUES ('daily', '2026-10-05', 'D')").run();
    db.prepare("INSERT INTO digests (def_key, period_key, title) VALUES ('general', '2026-W42', 'G')").run();
    expect(() =>
      db.prepare("INSERT INTO digests (def_key, period_key, title) VALUES ('general', '2026-W40', 'Dup')").run(),
    ).toThrow(/UNIQUE/);
  });

  it("does nothing the second time", () => {
    const db = withCategories();
    migrateDigests(db);
    migrateDigests(db);
    expect((db.prepare("SELECT COUNT(*) c FROM digests").get() as { c: number }).c).toBe(3);
  });
});

describe("definitions from the category digests", () => {
  /** A database from after categories, once the new tables and columns exist. */
  const legacy = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-defs-"));
    const raw = new Database(path.join(dir, "signal.db"));
    raw.exec(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
        digest_enabled INTEGER DEFAULT 0, digest_items INTEGER DEFAULT 8, sort_order INTEGER DEFAULT 100
      );
      CREATE TABLE channels (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, category TEXT, digest_def TEXT);
      CREATE TABLE digest_defs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'items', cadence TEXT NOT NULL DEFAULT 'weekly',
        categories TEXT DEFAULT '[]', sources TEXT DEFAULT '[]', item_count INTEGER DEFAULT 8,
        enabled INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 100, created_at TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO settings (key, value) VALUES ('signals_per_week', '6');
      INSERT INTO categories (key, label, digest_enabled, digest_items, sort_order) VALUES
        ('regulation', 'Regulation', 1, 5, 10), ('labs', 'Labs', 0, 8, 20), ('press', 'Press', 0, 8, 30);
      INSERT INTO channels (key, category) VALUES ('linkedin', NULL), ('policy', 'regulation'), ('labsfeed', 'labs');
    `);
    return raw;
  };

  const defs = (db: Database.Database) =>
    db.prepare("SELECT key, label, cadence, categories, item_count, enabled FROM digest_defs ORDER BY sort_order, key").all();

  it("creates general from signals_per_week and one weekly definition per category digest", () => {
    const db = legacy();
    seedLegacyDigestDefs(db);
    expect(defs(db)).toEqual([
      { key: "general", label: "General", cadence: "weekly", categories: "[]", item_count: 6, enabled: 1 },
      { key: "regulation", label: "Regulation", cadence: "weekly", categories: '["regulation"]', item_count: 5, enabled: 1 },
      // Digest off, but a channel was bound to it: kept, disabled, so the channel still writes nothing.
      { key: "labs", label: "Labs", cadence: "weekly", categories: '["labs"]', item_count: 8, enabled: 0 },
    ]);
  });

  it("points each bound channel at its definition", () => {
    const db = legacy();
    seedLegacyDigestDefs(db);
    expect(db.prepare("SELECT key, digest_def FROM channels ORDER BY id").all()).toEqual([
      { key: "linkedin", digest_def: null },
      { key: "policy", digest_def: "regulation" },
      { key: "labsfeed", digest_def: "labs" },
    ]);
  });

  it("runs only once: a definition deleted later does not come back", () => {
    const db = legacy();
    seedLegacyDigestDefs(db);
    db.prepare("DELETE FROM digest_defs WHERE key = 'regulation'").run();
    db.prepare("UPDATE channels SET digest_def = NULL WHERE key = 'policy'").run();
    seedLegacyDigestDefs(db);
    expect(db.prepare("SELECT COUNT(*) c FROM digest_defs WHERE key = 'regulation'").get()).toEqual({ c: 0 });
    expect(db.prepare("SELECT digest_def FROM channels WHERE key = 'policy'").get()).toEqual({ digest_def: null });
  });
});

describe("legacyDefKey", () => {
  it("maps the general digest, a category and a category called general", () => {
    expect([legacyDefKey(null), legacyDefKey(""), legacyDefKey("labs"), legacyDefKey("general")]).toEqual([
      "general",
      "general",
      "labs",
      "general-category",
    ]);
  });
});
```

In the `describe("category schema", …)` block, the last test of the file is

```ts
  it("creates digests with a category on a fresh database", () => {
    expect(columns("digests")).toContain("category");
  });
});
```

Replace it — through the end of the file — with:

```ts
  it("creates digests keyed by definition and period on a fresh database", () => {
    expect(columns("digests")).toEqual(expect.arrayContaining(["def_key", "period_key", "week_key", "category"]));
  });

  it("has digest definitions, with general seeded, and a channel binding to one", () => {
    expect(columns("digest_defs")).toEqual(
      expect.arrayContaining(["key", "label", "kind", "cadence", "categories", "sources", "item_count", "enabled"]),
    );
    expect(getDb().prepare("SELECT key FROM digest_defs").all()).toEqual([{ key: "general" }]);
    expect(columns("channels")).toContain("digest_def");
  });
});
```

In `src/lib/agents/digest.test.ts`, replace the whole `describe("saveDigest", …)` block (to the end of the file) with:

```ts
describe("saveDigest", () => {
  const result = (title: string) => ({ title, subtitle: "s", markdown: "m" });

  it("keeps two definitions of the same period apart", () => {
    const general = saveDigest("general", "2026-W43", result("G"), [], "English");
    const reg = saveDigest("regulation", "2026-W43", result("R"), [], "English");
    expect(general).not.toBe(reg);
  });

  it("rewrites the same row when run again for the same definition and period", () => {
    const first = saveDigest("regulation", "2026-W43", result("R1"), [], "English");
    const second = saveDigest("regulation", "2026-W43", result("R2"), [], "English");
    expect(second).toBe(first);
    expect(db().prepare("SELECT title FROM digests WHERE id = ?").get(first)).toEqual({ title: "R2" });
  });

  it("fills week_key for a weekly period only, and the legacy category", () => {
    const weekly = saveDigest("general", "2026-W43", result("W"), [], "English");
    const daily = saveDigest("ai-daily", "2026-10-22", result("D"), [], "English");
    expect(db().prepare("SELECT week_key, category FROM digests WHERE id = ?").get(weekly)).toEqual({
      week_key: "2026-W43",
      category: "",
    });
    expect(db().prepare("SELECT week_key, category FROM digests WHERE id = ?").get(daily)).toEqual({
      week_key: null,
      category: "ai-daily",
    });
  });
});
```

In `src/lib/pipeline.test.ts`, replace the `digest` helper with:

```ts
const digest = (week: string, category: string) =>
  Number(
    getDb()
      .prepare("INSERT INTO digests (def_key, period_key, week_key, category, title) VALUES (?, ?, ?, ?, 't')")
      .run(category || "general", week, week, category).lastInsertRowid,
  );
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run src/lib/db.test.ts src/lib/agents/digest.test.ts src/lib/pipeline.test.ts`
Expected: FAIL — `migrateDigests is not a function`, `seedLegacyDigestDefs is not a function`, `legacyDefKey is not a function`, missing `def_key`/`digest_defs`/`digest_def` columns, and `table digests has no column named def_key` in the digest and pipeline tests.

- [ ] **Step 3: Implement the schema**

In `src/lib/db.ts`, replace the whole `digestsDdl` function and its comment (everything between the `globalForDb` line and `function init`) with:

```ts
/**
 * The digests table. Shared by the fresh-database path and the rebuild below,
 * so the two can never drift apart.
 */
function digestsDdl(name: string) {
  return `
    CREATE TABLE IF NOT EXISTS ${name} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      def_key TEXT NOT NULL,           -- digest_defs.key that produced it
      period_key TEXT NOT NULL,        -- 2026-10-23 | 2026-W43 | 2026-10
      week_key TEXT,                   -- filled for weekly digests only
      category TEXT NOT NULL DEFAULT '', -- legacy: '' = general, otherwise the def key
      title TEXT,
      subtitle TEXT,
      markdown TEXT,
      item_ids TEXT,                   -- JSON array
      status TEXT DEFAULT 'draft',     -- draft | approved
      model TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      language TEXT,
      UNIQUE (def_key, period_key)
    );`;
}

/**
 * The definition key a pre-definitions digest or channel maps to: '' (and a
 * NULL channel binding) was the general digest; a category key becomes the
 * definition of the same key — except a category called `general`, which
 * would collide with the general definition.
 */
export function legacyDefKey(category: string | null | undefined): string {
  if (!category) return "general";
  return category === "general" ? "general-category" : category;
}

/** The same mapping, in SQL, for the backfills. */
const LEGACY_DEF_KEY_SQL = (column: string) =>
  `CASE WHEN ${column} IS NULL OR ${column} = '' THEN 'general' WHEN ${column} = 'general' THEN 'general-category' ELSE ${column} END`;
```

Inside the big `db.exec(` template in `init`, add this table directly **before** `CREATE TABLE IF NOT EXISTS posts (`:

```sql
    -- What a digest is made of and how often: the general digest, a category's,
    -- a daily one... digests.def_key and channels.digest_def store the key.
    CREATE TABLE IF NOT EXISTS digest_defs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,          -- stable slug, never renamed
      label TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'items',     -- items | rollup (rollup: phase 2)
      cadence TEXT NOT NULL DEFAULT 'weekly', -- daily | weekly | monthly
      categories TEXT DEFAULT '[]',      -- items: JSON array of category keys; [] = every category
      sources TEXT DEFAULT '[]',         -- rollup: JSON array of digest_defs keys
      item_count INTEGER DEFAULT 8,      -- items: top N (1..30)
      enabled INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 100,
      created_at TEXT DEFAULT (datetime('now'))
    );
```

Replace these two lines further down in `init`:

```ts
  ensureColumn(db, "channels", "category", "TEXT"); // NULL = the general digest
  migrateDigestCategory(db);
```

with:

```ts
  ensureColumn(db, "channels", "category", "TEXT"); // unused since digest definitions
  // Digest definitions: one digest per definition and period, and a channel
  // writes from a definition.
  ensureColumn(db, "channels", "digest_def", "TEXT"); // NULL = the general definition
  migrateDigests(db);
  seedLegacyDigestDefs(db);
```

`ensureColumn(db, "digests", "language", "TEXT")` runs earlier in `init` and must stay before `migrateDigests(db)` — the copy reads `language`.

Replace the whole `migrateDigestCategory` function and its comment (from `/**` `* Moves the digests' unique key from (week_key) to (week_key, category).` down to the line before `export function getDb()`) with:

```ts
/**
 * Moves the digests' unique key to (def_key, period_key), from either older
 * shape: (week_key) before categories, or (week_key, category) after them.
 * SQLite cannot alter a constraint, so the table is rebuilt — with foreign keys
 * off, because posts.digest_id is ON DELETE CASCADE and dropping the old table
 * with them on deletes every post. Ids are copied, so posts keep pointing at
 * the same digests. Exported for the test that runs it on legacy files.
 */
export function migrateDigests(db: Database.Database) {
  const cols = (db.prepare("PRAGMA table_info(digests)").all() as { name: string }[]).map((c) => c.name);
  if (cols.includes("def_key")) return;
  const category = cols.includes("category") ? "category" : "''";
  // Must be set outside the transaction: inside one, SQLite ignores it.
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      const count = (table: string) => (db.prepare(`SELECT COUNT(*) c FROM ${table}`).get() as { c: number }).c;
      db.exec(digestsDdl("digests_new"));
      db.exec(`
        INSERT INTO digests_new (id, def_key, period_key, week_key, category, title, subtitle, markdown, item_ids, status, model, created_at, language)
          SELECT id, ${LEGACY_DEF_KEY_SQL(category)}, week_key, week_key, ${category}, title, subtitle, markdown, item_ids, status, model, created_at, language
          FROM digests;
      `);
      // Not PRAGMA foreign_key_check: it would also flag unrelated old dangling
      // references elsewhere and stop the app from booting.
      if (count("digests_new") !== count("digests")) throw new Error("digests rebuild lost rows");
      db.exec(`
        DROP TABLE digests;
        ALTER TABLE digests_new RENAME TO digests;
      `);
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

/**
 * First boot with digest definitions — the table is still empty. Creates the
 * general definition, one weekly definition per category that had its digest
 * turned on (or that a channel was bound to, disabled when its digest was off,
 * so the channel keeps writing nothing rather than switching to the general
 * digest), and points each channel at its definition. Runs once: `general`
 * can never be deleted, so the table is never empty again. Exported for tests.
 */
export function seedLegacyDigestDefs(db: Database.Database) {
  if ((db.prepare("SELECT COUNT(*) c FROM digest_defs").get() as { c: number }).c) return;
  const raw = db.prepare("SELECT value FROM settings WHERE key = 'signals_per_week'").get() as
    | { value: string }
    | undefined;
  const perWeek = Math.min(30, Math.max(1, Math.round(Number(raw ? JSON.parse(raw.value) : 8)) || 8));
  db.transaction(() => {
    db.prepare(
      `INSERT INTO digest_defs (key, label, kind, cadence, categories, item_count, enabled, sort_order)
       VALUES ('general', 'General', 'items', 'weekly', '[]', ?, 1, 0)`,
    ).run(perWeek);
    const categories = db
      .prepare(
        `SELECT key, label, digest_enabled, digest_items, sort_order FROM categories
         WHERE digest_enabled = 1 OR key IN (SELECT category FROM channels WHERE category IS NOT NULL)
         ORDER BY sort_order, label`,
      )
      .all() as { key: string; label: string; digest_enabled: number; digest_items: number; sort_order: number }[];
    const insert = db.prepare(
      `INSERT INTO digest_defs (key, label, kind, cadence, categories, item_count, enabled, sort_order)
       VALUES (?, ?, 'items', 'weekly', ?, ?, ?, ?) ON CONFLICT(key) DO NOTHING`,
    );
    for (const c of categories) {
      const label = c.key === "general" ? `${c.label} (category)` : c.label;
      insert.run(legacyDefKey(c.key), label, JSON.stringify([c.key]), c.digest_items, c.digest_enabled ? 1 : 0, c.sort_order);
    }
    db.exec(
      `UPDATE channels SET digest_def = ${LEGACY_DEF_KEY_SQL("category")}
       WHERE category IS NOT NULL AND category != '' AND digest_def IS NULL`,
    );
  })();
}
```

In `src/lib/types.ts`, replace the start of the `Digest` type

```ts
export type Digest = {
  id: number;
  week_key: string;
```

with:

```ts
export type Digest = {
  id: number;
  /** The digest definition that produced it. */
  def_key: string;
  /** `2026-10-23`, `2026-W43` or `2026-10`. */
  period_key: string;
  /** Filled for weekly digests only. */
  week_key: string | null;
  /** Legacy: '' = general, otherwise the definition key. */
  category: string;
```

and in `Channel`, after the `category` field, add:

```ts
  /** Key of the digest definition this channel writes from. NULL = the general one. */
  digest_def: string | null;
```

In `src/lib/channels.ts`, inside `channelLabel`'s fallback object, after `category: null,` add:

```ts
      digest_def: null,
```

In `src/lib/agents/digest.ts`:

1. `import { getDb } from "../db";` → `import { getDb, legacyDefKey } from "../db";`, and add `import { isWeekKey } from "../weeks";` above `import { voiceVars } from "./shared";`.
2. Replace `saveDigest` and its comment with:

```ts
/**
 * One row per definition and period. Running a stage again rewrites the row in
 * place, so posts keep their digest_id. `week_key` is filled for weekly
 * periods and `category` keeps its legacy meaning ('' = general) for old
 * readers. Returns the id.
 */
export function saveDigest(
  defKey: string,
  periodKey: string,
  result: DigestText,
  items: Pick<Item, "id">[],
  language: string,
): number {
  const db = getDb();
  db.prepare(
    `INSERT INTO digests (def_key, period_key, week_key, category, title, subtitle, markdown, item_ids, model, status, language)
     VALUES (@def_key, @period_key, @week_key, @category, @title, @subtitle, @markdown, @item_ids, @model, 'draft', @language)
     ON CONFLICT(def_key, period_key) DO UPDATE SET
       title = excluded.title, subtitle = excluded.subtitle, markdown = excluded.markdown,
       item_ids = excluded.item_ids, model = excluded.model, language = excluded.language,
       created_at = datetime('now')`,
  ).run({
    def_key: defKey,
    period_key: periodKey,
    week_key: isWeekKey(periodKey) ? periodKey : null,
    category: defKey === "general" ? "" : defKey,
    title: result.title,
    subtitle: result.subtitle,
    markdown: result.markdown,
    item_ids: JSON.stringify(items.map((i) => i.id)),
    model: modelLabel(),
    language,
  });
  const row = db.prepare("SELECT id FROM digests WHERE def_key = ? AND period_key = ?").get(defKey, periodKey) as {
    id: number;
  };
  return row.id;
}
```

3. In `buildDigest`: `saveDigest(week, "", result, items, voice.language)` → `saveDigest("general", week, result, items, voice.language)`.
4. In `buildCategoryDigest`: `saveDigest(week, category.key, result, items, voice.language)` → `saveDigest(legacyDefKey(category.key), week, result, items, voice.language)`.

In `src/lib/agents/writer.ts`, in `writePosts`:

```ts
    | { id: number; week_key: string; title: string; markdown: string; item_ids: string }
```

→

```ts
    | { id: number; period_key: string; title: string; markdown: string; item_ids: string }
```

and `...voiceVars(voice, digest.week_key),` → `...voiceVars(voice, digest.period_key),`.

In `src/lib/pipeline.ts`:

1. `import { getDb, getSetting } from "./db";` → `import { getDb, getSetting, legacyDefKey } from "./db";`
2. Replace `PostGroup` and `groupChannelsByDigest` (from `export type PostGroup` to the line before `export async function runPipeline`) with:

```ts
export type PostGroup = { digestId: number; defKey: string; channels: Channel[] };

/**
 * The posts stage, planned: one group per digest the channels write from.
 * A channel bound to a category with no digest this week is skipped with a
 * warning; the general digest missing is still an error, as it always was.
 */
export function groupChannelsByDigest(
  week: string,
  channels: Channel[],
): { groups: PostGroup[]; skipped: string[] } {
  const byDef = new Map<string, Channel[]>();
  for (const c of channels) {
    const key = legacyDefKey(c.category);
    byDef.set(key, [...(byDef.get(key) ?? []), c]);
  }

  const find = getDb().prepare("SELECT id FROM digests WHERE def_key = ? AND period_key = ?");
  const groups: PostGroup[] = [];
  const skipped: string[] = [];
  for (const [defKey, list] of byDef) {
    const row = find.get(defKey, week) as { id: number } | undefined;
    if (row) groups.push({ digestId: row.id, defKey, channels: list });
    else if (defKey === "general") throw new Error(`There is no digest for ${week} yet.`);
    else skipped.push(`Channels ${list.map((c) => c.label).join(", ")} skipped: no "${defKey}" digest for ${week}.`);
  }
  return { groups, skipped };
}
```

In `src/app/page.tsx`:

```ts
  const digest = db.prepare("SELECT * FROM digests WHERE week_key = ? AND category = ''").get(week) as
```

→

```ts
  const digest = db.prepare("SELECT * FROM digests WHERE def_key = 'general' AND period_key = ?").get(week) as
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run src/lib/db.test.ts src/lib/agents/digest.test.ts src/lib/pipeline.test.ts`
Expected: PASS.

Prove the guard matters: comment out `db.pragma("foreign_keys = OFF");` in `migrateDigests`, rerun `npx vitest run src/lib/db.test.ts` — "keeps every digest id, its data and every post" must fail with a post count of 0. Restore the line.

- [ ] **Step 5: Full check and commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all green. `grep -rn "migrateDigestCategory\|ON CONFLICT(week_key" src` prints nothing.

```bash
git add src/lib/db.ts src/lib/db.test.ts src/lib/types.ts src/lib/channels.ts src/lib/agents/digest.ts src/lib/agents/digest.test.ts src/lib/agents/writer.ts src/lib/pipeline.ts src/lib/pipeline.test.ts src/app/page.tsx
git commit -m "feat: digest definitions table, digests keyed by definition and period"
```

---

### Task 3: The digest definitions module

**Files:**
- Create: `src/lib/slug.ts`
- Create: `src/lib/digest-defs.ts`
- Modify: `src/lib/categories.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/actions.ts` (one line: `deleteCategory` now returns a value)
- Test: `src/lib/digest-defs.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/digest-defs.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

process.env.SIGNAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "signal-defs-"));

const { getDb, setSetting } = await import("./db");
const { deleteCategory, getCategories } = await import("./categories");
const { deleteDigestDef, getDigestDef, getDigestDefs, saveDigestDef } = await import("./digest-defs");

const db = () => getDb();
const input = (over: Partial<Parameters<typeof saveDigestDef>[0]> = {}) => ({
  label: "AI daily",
  cadence: "daily" as const,
  categories: [] as string[],
  item_count: 5,
  enabled: true,
  ...over,
});

beforeEach(() => {
  db().exec("DELETE FROM digest_defs; DELETE FROM channels; DELETE FROM categories; DELETE FROM settings;");
  getCategories(); // the shipped categories: labs, regulation, press...
});

describe("seeding", () => {
  it("creates general, weekly over every category, sized by signals_per_week", () => {
    setSetting("signals_per_week", 6);
    expect(getDigestDefs()).toEqual([
      expect.objectContaining({ key: "general", kind: "items", cadence: "weekly", categories: [], item_count: 6, enabled: 1 }),
    ]);
  });

  it("never overwrites an edited general", () => {
    getDigestDefs();
    saveDigestDef(input({ key: "general", label: "Everything", cadence: "weekly", item_count: 12 }));
    setSetting("signals_per_week", 3);
    expect(getDigestDef("general")).toMatchObject({ label: "Everything", item_count: 12 });
  });
});

describe("saveDigestDef", () => {
  it("derives the key from the name and stores the categories as a list", () => {
    const key = saveDigestDef(input({ label: "Regulación diaria", categories: ["regulation", "regulation"] }));
    expect(key).toBe("regulacion-diaria");
    expect(getDigestDef(key)).toMatchObject({ cadence: "daily", categories: ["regulation"], item_count: 5 });
  });

  it("refuses a duplicate key, an unknown category, an empty name and a bad cadence", () => {
    saveDigestDef(input());
    expect(() => saveDigestDef(input())).toThrow(/already exists/);
    expect(() => saveDigestDef(input({ label: "X", categories: ["nope"] }))).toThrow('Unknown category "nope"');
    expect(() => saveDigestDef(input({ label: " " }))).toThrow(/needs a name/);
    expect(() => saveDigestDef(input({ label: "Y", cadence: "hourly" as never }))).toThrow(/Unknown cadence/);
  });

  it("refuses roll-ups in phase 1", () => {
    expect(() => saveDigestDef(input({ label: "Monthly", kind: "rollup" }))).toThrow(/Roll-up/);
  });

  it("keeps the key when renaming and clamps the item count", () => {
    const key = saveDigestDef(input());
    saveDigestDef(input({ key, label: "Renamed", item_count: 99, enabled: false }));
    expect(getDigestDef(key)).toMatchObject({ label: "Renamed", item_count: 30, enabled: 0 });
  });
});

describe("deleteDigestDef", () => {
  it("sends its channels back to general and leaves its digests in the archive", () => {
    const key = saveDigestDef(input());
    db().prepare("INSERT INTO channels (key, label, digest_def) VALUES ('daily-x', 'X', ?)").run(key);
    db().prepare("INSERT INTO digests (def_key, period_key, title) VALUES (?, '2026-10-22', 't')").run(key);
    deleteDigestDef(key);
    expect(getDigestDef(key)).toBeUndefined();
    expect(db().prepare("SELECT digest_def FROM channels WHERE key = 'daily-x'").get()).toEqual({ digest_def: null });
    expect(db().prepare("SELECT COUNT(*) c FROM digests WHERE def_key = ?").get(key)).toEqual({ c: 1 });
  });

  it("takes it out of every roll-up's sources", () => {
    const key = saveDigestDef(input());
    db()
      .prepare("INSERT INTO digest_defs (key, label, kind, cadence, sources) VALUES ('month', 'Month', 'rollup', 'monthly', ?)")
      .run(JSON.stringify([key, "general"]));
    deleteDigestDef(key);
    expect(getDigestDef("month")?.sources).toEqual(["general"]);
  });

  it("refuses to delete general", () => {
    getDigestDefs();
    expect(() => deleteDigestDef("general")).toThrow(/general/);
  });
});

describe("deleting a category", () => {
  it("removes it from every definition and disables one left with none", () => {
    const both = saveDigestDef(input({ label: "Both", categories: ["regulation", "labs"] }));
    const only = saveDigestDef(input({ label: "Only", categories: ["regulation"] }));
    expect(deleteCategory("regulation")).toEqual(["Only"]);
    expect(getDigestDef(both)).toMatchObject({ categories: ["labs"], enabled: 1 });
    expect(getDigestDef(only)).toMatchObject({ categories: [], enabled: 0 });
  });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run src/lib/digest-defs.test.ts`
Expected: FAIL — `Error: Cannot find module '/src/lib/digest-defs'`.

- [ ] **Step 3: Implement**

Create `src/lib/slug.ts`:

```ts
/** Lowercase, accents stripped, anything else collapsed to single dashes. */
export function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

In `src/lib/types.ts`, add as the first line of the file:

```ts
import type { Cadence } from "./periods";
```

and add before `export type Item = {`:

```ts
export type DigestKind = "items" | "rollup";

/** What a digest is made of and how often it is written. Settings → Digests. */
export type DigestDef = {
  id: number;
  /** Stable slug: digests.def_key and channels.digest_def store it. */
  key: string;
  label: string;
  /** Phase 1 builds `items` only; `rollup` exists in the schema for phase 2. */
  kind: DigestKind;
  cadence: Cadence;
  /** items: category keys whose sources feed it. Empty = every category. */
  categories: string[];
  /** rollup: keys of the item definitions it combines. */
  sources: string[];
  /** items: how many items feed it, 1..30. */
  item_count: number;
  enabled: number;
  sort_order: number;
};
```

Create `src/lib/digest-defs.ts`:

```ts
import { getDb, getSetting, parseJson } from "./db";
import { isCadence, type Cadence } from "./periods";
import { slugify } from "./slug";
import type { DigestDef, DigestKind } from "./types";

/** The definition behind the dashboard and every unbound channel. Never deleted. */
export const GENERAL_DEF = "general";

export type DigestDefInput = {
  /** Empty when creating: the key is derived from the label and never changes afterwards. */
  key?: string;
  label: string;
  /** Only `items` in phase 1. Ignored on update: a definition keeps its kind. */
  kind?: DigestKind;
  cadence: Cadence;
  /** Category keys; empty = every category. */
  categories: string[];
  item_count: number;
  enabled: boolean;
  sort_order?: number;
};

type Row = Omit<DigestDef, "categories" | "sources"> & { categories: string | null; sources: string | null };

function toDef(row: Row): DigestDef {
  return {
    ...row,
    categories: parseJson<string[]>(row.categories, []),
    sources: parseJson<string[]>(row.sources, []),
  };
}

const clampItems = (n: number) => Math.min(30, Math.max(1, Math.round(n) || 8));

/**
 * Runs on every read, like seedCategories(). Only makes sure `general` exists;
 * the definitions migrated from category digests are created once, at boot
 * (db.ts, seedLegacyDigestDefs).
 */
export function seedDigestDefs() {
  getDb()
    .prepare(
      `INSERT INTO digest_defs (key, label, kind, cadence, categories, item_count, enabled, sort_order)
       VALUES (?, 'General', 'items', 'weekly', '[]', ?, 1, 0)
       ON CONFLICT(key) DO NOTHING`,
    )
    .run(GENERAL_DEF, clampItems(getSetting<number>("signals_per_week", 8)));
}

export function getDigestDefs(onlyEnabled = false): DigestDef[] {
  seedDigestDefs();
  const rows = getDb()
    .prepare(`SELECT * FROM digest_defs ${onlyEnabled ? "WHERE enabled = 1" : ""} ORDER BY sort_order, label`)
    .all() as Row[];
  return rows.map(toDef);
}

export function getDigestDef(key: string): DigestDef | undefined {
  const row = getDb().prepare("SELECT * FROM digest_defs WHERE key = ?").get(key) as Row | undefined;
  return row && toDef(row);
}

/** Display metadata for a key whose definition was deleted. */
export function digestDefLabel(defs: DigestDef[], key: string): DigestDef {
  return (
    defs.find((d) => d.key === key) ?? {
      id: -1,
      key,
      label: key,
      kind: "items",
      cadence: "weekly",
      categories: [],
      sources: [],
      item_count: 8,
      enabled: 0,
      sort_order: 999,
    }
  );
}

/** Creates (no key) or updates (key) a definition. Returns its key. */
export function saveDigestDef(input: DigestDefInput): string {
  const label = input.label.trim();
  if (!label) throw new Error("The digest needs a name");
  if (!isCadence(input.cadence)) throw new Error(`Unknown cadence "${input.cadence}"`);
  if ((input.kind ?? "items") !== "items") {
    throw new Error("Roll-up digests are not available yet: only item digests can be created");
  }

  const db = getDb();
  const categories = [...new Set(input.categories.map((c) => c.trim()).filter(Boolean))];
  const known = new Set(
    (db.prepare("SELECT key FROM categories").all() as { key: string }[]).map((r) => r.key),
  );
  const unknown = categories.find((c) => !known.has(c));
  if (unknown) throw new Error(`Unknown category "${unknown}"`);

  const row = {
    label,
    cadence: input.cadence,
    categories: JSON.stringify(categories),
    item_count: clampItems(input.item_count),
    enabled: input.enabled ? 1 : 0,
    sort_order: Math.round(input.sort_order ?? 100),
  };

  if (input.key) {
    const res = db
      .prepare(
        `UPDATE digest_defs SET label = @label, cadence = @cadence, categories = @categories,
           item_count = @item_count, enabled = @enabled, sort_order = @sort_order
         WHERE key = @key`,
      )
      .run({ ...row, key: input.key });
    if (!res.changes) throw new Error(`Unknown digest "${input.key}"`);
    return input.key;
  }

  const key = slugify(label);
  if (!key) throw new Error("The digest name needs at least one letter or digit");
  if (getDigestDef(key)) throw new Error(`A digest with the key "${key}" already exists`);
  db.prepare(
    `INSERT INTO digest_defs (key, label, kind, cadence, categories, item_count, enabled, sort_order)
     VALUES (@key, @label, 'items', @cadence, @categories, @item_count, @enabled, @sort_order)`,
  ).run({ ...row, key });
  return key;
}

/**
 * Its channels go back to the general digest and it leaves every roll-up's
 * sources. The digests it already wrote stay in the archive under its key.
 */
export function deleteDigestDef(key: string) {
  if (key === GENERAL_DEF) throw new Error("The general digest cannot be deleted. Disable it instead.");
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE channels SET digest_def = NULL WHERE digest_def = ?").run(key);
    const update = db.prepare("UPDATE digest_defs SET sources = ? WHERE key = ?");
    for (const def of getDigestDefs().filter((d) => d.sources.includes(key))) {
      update.run(JSON.stringify(def.sources.filter((s) => s !== key)), def.key);
    }
    db.prepare("DELETE FROM digest_defs WHERE key = ?").run(key);
  })();
}

/**
 * A category is being deleted: take it out of every definition. One left with
 * no category would silently become "every category", so it is disabled
 * instead. Returns the labels of the definitions disabled. Called by
 * deleteCategory() inside its transaction.
 */
export function removeCategoryFromDefs(category: string): string[] {
  const db = getDb();
  const update = db.prepare("UPDATE digest_defs SET categories = ?, enabled = ? WHERE key = ?");
  const disabled: string[] = [];
  for (const def of getDigestDefs().filter((d) => d.categories.includes(category))) {
    const rest = def.categories.filter((c) => c !== category);
    if (!rest.length && def.enabled) disabled.push(def.label);
    update.run(JSON.stringify(rest), rest.length ? def.enabled : 0, def.key);
  }
  return disabled;
}
```

In `src/lib/categories.ts`:

1. Replace the import of `getDb` with:

```ts
import { getDb } from "./db";
import { removeCategoryFromDefs } from "./digest-defs";
import { slugify } from "./slug";
```

2. Replace the whole `export function slugify(raw: string): string { … }` with:

```ts
export { slugify };
```

(the categories test and the actions keep importing `slugify` from here).

3. Replace `deleteCategory` and its comment with:

```ts
/**
 * Its sources move to `general` and its channels back to the general digest.
 * It is also taken out of every digest definition; a definition left with no
 * category is disabled rather than silently widened to every category. Returns
 * the labels of the definitions disabled that way. Digests already written
 * for it are kept.
 */
export function deleteCategory(key: string): string[] {
  if (key === GENERAL) throw new Error("The general category cannot be deleted: it is where orphaned sources go");
  const db = getDb();
  return db.transaction(() => {
    db.prepare("UPDATE sources SET category = ? WHERE category = ?").run(GENERAL, key);
    db.prepare("UPDATE channels SET category = NULL WHERE category = ?").run(key);
    db.prepare("DELETE FROM categories WHERE key = ?").run(key);
    return removeCategoryFromDefs(key);
  })();
}
```

In `src/lib/actions.ts`, `actionDeleteCategory`:

```ts
  const res = await guard(() => deleteCategory(key));
```

→

```ts
  const res = await guard(() => {
    deleteCategory(key);
  });
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run src/lib/digest-defs.test.ts src/lib/categories.test.ts`
Expected: PASS.

- [ ] **Step 5: Full check and commit**

Run: `npm run lint && npm run typecheck && npm test`

```bash
git add src/lib/slug.ts src/lib/digest-defs.ts src/lib/digest-defs.test.ts src/lib/categories.ts src/lib/types.ts src/lib/actions.ts
git commit -m "feat: digest definitions module — seed, save, delete"
```

---

### Task 4: Build any item definition for any period

**Files:**
- Modify: `src/lib/agents/digest.ts` (replaced)
- Modify: `src/lib/pipeline.ts` (digest stage only)
- Modify: `src/lib/prompts.ts`, `src/lib/i18n/es.ts` (prompt descriptions)
- Test: `src/lib/agents/digest.test.ts` (replaced)

- [ ] **Step 1: Write the failing tests**

Replace `src/lib/agents/digest.test.ts` with:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { DigestDef } from "../types";

// Day boundaries follow the process time zone; pin the cluster's.
process.env.TZ = "America/Argentina/Buenos_Aires";
// Demo mode whatever the shell exports: these tests must never call a real model.
for (const k of ["SIGNAL_LLM_PROVIDER", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY", "LLM_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"]) {
  delete process.env[k];
}
process.env.SIGNAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "signal-digest-"));

const { getDb } = await import("../db");
const { llmReady } = await import("../llm");
const { getVoice } = await import("../pipeline");
const { buildDigestFor, digestItems, saveDigest } = await import("./digest");

const db = () => getDb();
let n = 0;
const source = (category: string) =>
  Number(
    db()
      .prepare("INSERT INTO sources (name, url, kind, category) VALUES (?, ?, 'rss', ?)")
      .run(`s${++n}`, `https://example.com/${n}`, category).lastInsertRowid,
  );
const item = (sourceId: number, week: string, score: number | null, status = "scored", published: string | null = null) =>
  db()
    .prepare(
      "INSERT INTO items (source_id, external_id, title, url, week_key, score, status, published_at) VALUES (?, ?, ?, 'u', ?, ?, ?, ?)",
    )
    .run(sourceId, `e${++n}`, `t${n}`, week, score, status, published);

const def = (over: Partial<DigestDef> = {}): DigestDef => ({
  id: 1,
  key: "general",
  label: "General",
  kind: "items",
  cadence: "weekly",
  categories: [],
  sources: [],
  item_count: 8,
  enabled: 1,
  sort_order: 0,
  ...over,
});

beforeEach(() => {
  db().exec("DELETE FROM posts; DELETE FROM digests; DELETE FROM items; DELETE FROM sources;");
});

describe("digestItems", () => {
  it("puts the curator's picks first, then the best scored, and never a rejected item", () => {
    const labs = source("labs");
    item(labs, "2026-W43", 95);
    item(labs, "2026-W43", 60, "selected");
    item(labs, "2026-W43", 99, "rejected");
    item(labs, "2026-W43", 50, "used"); // already written about: still one of the picks
    item(labs, "2026-W43", null, "new"); // not scored: out
    item(labs, "2026-W42", 98); // other week: out
    expect(digestItems(def(), "2026-W43").map((i) => i.score)).toEqual([60, 50, 95]);
    expect(digestItems(def({ item_count: 2 }), "2026-W43").map((i) => i.score)).toEqual([60, 50]);
  });

  it("keeps to the definition's categories", () => {
    const reg = source("regulation");
    const press = source("press");
    const labs = source("labs");
    item(reg, "2026-W43", 70);
    item(press, "2026-W43", 80);
    item(labs, "2026-W43", 90);
    expect(digestItems(def({ categories: ["regulation", "press"] }), "2026-W43").map((i) => i.score)).toEqual([80, 70]);
  });

  it("takes a day by published_at, in local time", () => {
    const labs = source("labs");
    // 2026-10-22 in Buenos Aires runs from 03:00Z on the 22nd to 03:00Z on the 23rd.
    item(labs, "2026-W43", 70, "scored", "2026-10-22T03:00:00.000Z");
    item(labs, "2026-W43", 80, "scored", "2026-10-23T02:59:59.000Z");
    item(labs, "2026-W43", 90, "scored", "2026-10-22T02:59:59.000Z"); // still the 21st locally
    item(labs, "2026-W43", 99, "scored", "2026-10-23T03:00:00.000Z"); // already the 23rd
    expect(digestItems(def({ cadence: "daily" }), "2026-10-22").map((i) => i.score)).toEqual([80, 70]);
  });

  it("takes a month by published_at", () => {
    const labs = source("labs");
    item(labs, "2026-W40", 70, "scored", "2026-10-01T03:00:00.000Z");
    item(labs, "2026-W40", 80, "scored", "2026-09-30T12:00:00.000Z");
    expect(digestItems(def({ cadence: "monthly" }), "2026-10").map((i) => i.score)).toEqual([70]);
  });
});

describe("buildDigestFor", () => {
  it("runs in demo mode here", () => {
    expect(llmReady()).toBe(false);
  });

  it("skips a period with nothing scored", async () => {
    expect(await buildDigestFor(def(), "2026-W43", getVoice())).toEqual({ skipped: true });
  });

  it("writes the digest under the definition and the period", async () => {
    const labs = source("labs");
    item(labs, "2026-W43", 70, "scored", "2026-10-22T12:00:00.000Z");
    const r = await buildDigestFor(def({ key: "labs-daily", label: "Labs daily", cadence: "daily", categories: ["labs"] }), "2026-10-22", getVoice());
    expect(r).toMatchObject({ items: 1 });
    expect(db().prepare("SELECT def_key, period_key, week_key, title FROM digests").get()).toEqual({
      def_key: "labs-daily",
      period_key: "2026-10-22",
      week_key: null,
      title: "Labs daily — 2026-10-22",
    });
  });

  it("refuses a roll-up", async () => {
    await expect(buildDigestFor(def({ kind: "rollup" }), "2026-10", getVoice())).rejects.toThrow(/roll-up/);
  });
});

describe("saveDigest", () => {
  const result = (title: string) => ({ title, subtitle: "s", markdown: "m" });

  it("keeps two definitions of the same period apart", () => {
    const general = saveDigest("general", "2026-W43", result("G"), [], "English");
    const reg = saveDigest("regulation", "2026-W43", result("R"), [], "English");
    expect(general).not.toBe(reg);
  });

  it("rewrites the same row when run again for the same definition and period", () => {
    const first = saveDigest("regulation", "2026-W43", result("R1"), [], "English");
    const second = saveDigest("regulation", "2026-W43", result("R2"), [], "English");
    expect(second).toBe(first);
    expect(db().prepare("SELECT title FROM digests WHERE id = ?").get(first)).toEqual({ title: "R2" });
  });

  it("fills week_key for a weekly period only, and the legacy category", () => {
    const weekly = saveDigest("general", "2026-W43", result("W"), [], "English");
    const daily = saveDigest("ai-daily", "2026-10-22", result("D"), [], "English");
    expect(db().prepare("SELECT week_key, category FROM digests WHERE id = ?").get(weekly)).toEqual({
      week_key: "2026-W43",
      category: "",
    });
    expect(db().prepare("SELECT week_key, category FROM digests WHERE id = ?").get(daily)).toEqual({
      week_key: null,
      category: "ai-daily",
    });
  });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run src/lib/agents/digest.test.ts`
Expected: FAIL — `digestItems is not a function` / `buildDigestFor is not a function`.

- [ ] **Step 3: Implement the builder**

Replace `src/lib/agents/digest.ts` with:

```ts
import { categoryLabel, getCategories } from "../categories";
import { getDb } from "../db";
import { chatJson, llmReady, modelLabel } from "../llm";
import { periodRange, type PeriodKey } from "../periods";
import { getPrompt, renderPrompt } from "../prompts";
import type { DigestDef, Item, VoiceProfile } from "../types";
import { isWeekKey } from "../weeks";
import { voiceVars } from "./shared";

type DigestText = { title: string; subtitle: string; markdown: string };

function signalPayload(items: Item[]) {
  return items.map((i) => ({
    title: i.title,
    url: i.url,
    published: i.published_at,
    score: i.score,
    why: i.why,
    angle: i.angle,
    summary: (i.summary ?? "").slice(0, 900),
  }));
}

function demoLines(items: Item[]) {
  return items
    .map(
      (i) =>
        `### ${i.title}\n\n${(i.summary ?? "").slice(0, 300)}\n\n**Angle to publish:** ${i.angle ?? "—"}\n\n[Source](${i.url})`,
    )
    .join("\n\n");
}

/**
 * One row per definition and period. Running a stage again rewrites the row in
 * place, so posts keep their digest_id. `week_key` is filled for weekly
 * periods and `category` keeps its legacy meaning ('' = general) for old
 * readers. Returns the id.
 */
export function saveDigest(
  defKey: string,
  periodKey: string,
  result: DigestText,
  items: Pick<Item, "id">[],
  language: string,
): number {
  const db = getDb();
  db.prepare(
    `INSERT INTO digests (def_key, period_key, week_key, category, title, subtitle, markdown, item_ids, model, status, language)
     VALUES (@def_key, @period_key, @week_key, @category, @title, @subtitle, @markdown, @item_ids, @model, 'draft', @language)
     ON CONFLICT(def_key, period_key) DO UPDATE SET
       title = excluded.title, subtitle = excluded.subtitle, markdown = excluded.markdown,
       item_ids = excluded.item_ids, model = excluded.model, language = excluded.language,
       created_at = datetime('now')`,
  ).run({
    def_key: defKey,
    period_key: periodKey,
    week_key: isWeekKey(periodKey) ? periodKey : null,
    category: defKey === "general" ? "" : defKey,
    title: result.title,
    subtitle: result.subtitle,
    markdown: result.markdown,
    item_ids: JSON.stringify(items.map((i) => i.id)),
    model: modelLabel(),
    language,
  });
  const row = db.prepare("SELECT id FROM digests WHERE def_key = ? AND period_key = ?").get(defKey, periodKey) as {
    id: number;
  };
  return row.id;
}

/**
 * The items that feed an item digest: scored, not rejected on the radar, in
 * the period (a weekly period by `week_key`, which is indexed; a day or a month
 * by `published_at`), from the definition's categories (all when empty). The
 * curator's picks and the items already written about go first, then the rest
 * by score, up to `item_count`.
 */
export function digestItems(def: Pick<DigestDef, "categories" | "item_count">, period: PeriodKey): Item[] {
  const where = ["i.score IS NOT NULL", "i.status != 'rejected'"];
  const params: unknown[] = [];
  if (isWeekKey(period)) {
    where.push("i.week_key = ?");
    params.push(period);
  } else {
    const { start, end } = periodRange(period);
    // published_at is stored as toISOString(), so the bounds are compared the same way.
    where.push("i.published_at >= ? AND i.published_at < ?");
    params.push(start.toISOString(), end.toISOString());
  }
  if (def.categories.length) {
    where.push(`s.category IN (${def.categories.map(() => "?").join(", ")})`);
    params.push(...def.categories);
  }
  return getDb()
    .prepare(
      `SELECT i.* FROM items i LEFT JOIN sources s ON s.id = i.source_id
       WHERE ${where.join(" AND ")}
       ORDER BY CASE WHEN i.status IN ('selected', 'used') THEN 0 ELSE 1 END, i.score DESC, i.id
       LIMIT ?`,
    )
    .all(...params, def.item_count) as Item[];
}

/**
 * Writes the digest of one definition for one period. The prompt follows the
 * shape: no categories → `digest`; some categories → `category_digest`, with
 * `{{category}}` the labels joined. A period with nothing scored is skipped,
 * not an error.
 */
export async function buildDigestFor(
  def: DigestDef,
  period: PeriodKey,
  voice: VoiceProfile,
): Promise<{ digestId: number; items: number } | { skipped: true }> {
  if (def.kind !== "items") throw new Error(`"${def.label}" is a roll-up: roll-ups are not available yet.`);
  const items = digestItems(def, period);
  if (!items.length) return { skipped: true };

  const categories = getCategories();
  const scope = def.categories.map((key) => categoryLabel(categories, key).label).join(", ");
  let result: DigestText;

  if (!llmReady()) {
    result = scope
      ? {
          title: `${def.label} — ${period}`,
          subtitle: "Demo mode: no LLM configured, so the best items of these categories are listed without analysis.",
          markdown: `This digest was produced without a model. Configure a provider under **Model & keys** and run the pipeline again to get the real write-up.\n\n## The signals\n\n${demoLines(items)}`,
        }
      : {
          title: `AI radar — ${period}`,
          subtitle: "Demo mode: no LLM configured, so the selected items are listed without analysis.",
          markdown: `This digest was produced without a model. Configure a provider under **Model & keys** and run the pipeline again to get the real write-up.\n\n## The signals\n\n${demoLines(items)}\n\n## Noise of the week\n\n_(needs a model)_\n\n## What I would say\n\n_(needs a model)_`,
        };
  } else {
    const prompt = getPrompt(scope ? "category_digest" : "digest");
    result = await chatJson({
      system: prompt.system,
      prompt: renderPrompt(prompt.template, {
        ...voiceVars(voice, period),
        ...(scope ? { category: scope } : {}),
        signals: JSON.stringify(signalPayload(items), null, 1),
      }),
      maxTokens: 16000,
      temperature: 0.7,
    });
  }

  return { digestId: saveDigest(def.key, period, result, items, voice.language), items: items.length };
}
```

- [ ] **Step 4: Point the pipeline's digest stage at the definitions**

Until Task 7 adds the due-definition runner, the digest stage writes every enabled weekly definition for the run's week — the same result as before for the general digest and the category digests.

In `src/lib/pipeline.ts`, replace

```ts
import { buildCategoryDigest, buildDigest } from "./agents/digest";
import { getCategories } from "./categories";
```

with

```ts
import { buildDigestFor } from "./agents/digest";
import { getDigestDefs } from "./digest-defs";
```

and replace the whole `if (stages.includes("digest")) { … }` block with:

```ts
    if (stages.includes("digest")) {
      // Every enabled weekly definition, for the run's week. One failing or
      // empty definition is a warning, not a failed run.
      const digests: Record<string, unknown>[] = [];
      for (const def of getDigestDefs(true).filter((d) => d.kind === "items" && d.cadence === "weekly")) {
        try {
          const r = await buildDigestFor(def, week, voice);
          digests.push({ def: def.key, period: week, ...r });
          log.push(
            "skipped" in r
              ? `⚠ Digest "${def.label}" ${week} skipped: no scored items.`
              : `Digest "${def.label}" ${week}: ${r.items} signals.`,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          digests.push({ def: def.key, period: week, error: msg });
          log.push(`⚠ Digest "${def.label}" ${week} failed: ${msg}`);
        }
      }
      stats.digests = digests;
    }
```

- [ ] **Step 5: Prompt documentation**

In `src/lib/prompts.ts`:

1. The `week` entry of `VOICE_VARS`:

```ts
  { name: "week", description: "Period being processed: an ISO week (2026-W36), a day (2026-10-23) or a month (2026-10)" },
```

2. In the `digest` entry: `label: "Weekly digest",` → `label: "Digest (all categories)",` and its description →

```ts
      "Writes the working document from the selected signals. Used by every digest that covers all categories, the general one included. It is the raw material every post is derived from.",
```

3. In the `category_digest` entry, its description →

```ts
      "Writes a digest restricted to some categories from their best-scored items. Used by every digest definition that picks categories; channels bound to it write from it.",
```

and its `category` variable → `{ name: "category", description: "Names of the categories, comma separated" },`.

In `src/lib/i18n/es.ts`, inside `registry.prompts` (not `run.stages`), replace the `digest` and `category_digest` entries with:

```ts
      digest: {
        label: "Resumen (todas las categorías)",
        description:
          "Escribe el documento de trabajo a partir de las señales seleccionadas. Lo usa todo resumen que cubre todas las categorías, el general incluido. Es la materia prima de la que sale cada post.",
      },
      category_digest: {
        label: "Resumen por categoría",
        description:
          "Escribe un resumen acotado a algunas categorías a partir de sus items mejor puntuados. Lo usa toda definición de resumen que elige categorías; los canales asociados a ella escriben a partir de él.",
      },
```

- [ ] **Step 6: Run the tests and see them pass**

Run: `npx vitest run src/lib/agents/digest.test.ts src/lib/pipeline.test.ts`
Expected: PASS.

- [ ] **Step 7: Full check and commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all green; `grep -rn "buildDigest\b\|buildCategoryDigest\|categoryDigestItems" src` prints nothing.

```bash
git add src/lib/agents/digest.ts src/lib/agents/digest.test.ts src/lib/pipeline.ts src/lib/prompts.ts src/lib/i18n/es.ts
git commit -m "feat: build any item digest definition for any period"
```

---

### Task 5: Curator — score only new items, never re-select a rejected one

**Files:**
- Modify: `src/lib/agents/curator.ts`
- Test: `src/lib/agents/curator.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/agents/curator.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

// The heuristic scorer, whatever the shell exports: no real model here.
for (const k of ["SIGNAL_LLM_PROVIDER", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY", "LLM_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"]) {
  delete process.env[k];
}
process.env.SIGNAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "signal-curator-"));

const { getDb, setSetting } = await import("../db");
const { getVoice } = await import("../pipeline");
const { curateWeek } = await import("./curator");

const db = () => getDb();
let n = 0;
/** image_url set, so the image pass after selection has nothing to fetch. */
const item = (title: string, status: string, score: number | null = null, cluster: string | null = null) =>
  Number(
    db()
      .prepare(
        `INSERT INTO items (external_id, title, url, week_key, score, status, cluster, image_url, published_at)
         VALUES (?, ?, 'https://example.com', '2026-W43', ?, ?, ?, 'img', ?)`,
      )
      .run(`e${++n}`, title, score, status, cluster ?? title, `2026-10-2${n % 6}T12:00:00.000Z`).lastInsertRowid,
  );
const row = (id: number) => db().prepare("SELECT status, score FROM items WHERE id = ?").get(id) as { status: string; score: number | null };

beforeEach(() => {
  db().exec("DELETE FROM items;");
  setSetting("signals_per_week", 2);
});

describe("curateWeek", () => {
  it("scores only the items that have no score yet", async () => {
    const fresh = item("Agent governance and compliance", "new");
    const old = item("Old story", "scored", 12);
    const r = await curateWeek("2026-W43", getVoice());
    expect(r.scored).toBe(1);
    expect(row(fresh).score).not.toBeNull();
    expect(row(old).score).toBe(12); // not re-scored
  });

  it("never selects a rejected item and leaves a used one used", async () => {
    const rejected = item("Rejected", "rejected", 99);
    const used = item("Used", "used", 95);
    const best = item("Best", "scored", 90);
    const other = item("Other", "scored", 80);
    item("Trigger", "new"); // something to score, so the selection runs
    await curateWeek("2026-W43", getVoice());
    expect(row(rejected).status).toBe("rejected");
    expect(row(used).status).toBe("used");
    expect(row(best).status).toBe("selected");
    // signals_per_week = 2: the used item counts towards it.
    expect(row(other).status).toBe("scored");
  });

  it("does nothing on a week with no new items", async () => {
    const old = item("Old", "selected", 70);
    expect(await curateWeek("2026-W43", getVoice())).toMatchObject({ scored: 0 });
    expect(row(old).status).toBe("selected");
  });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run src/lib/agents/curator.test.ts`
Expected: FAIL — "scores only the items that have no score yet" (`scored` is 2 and the old score 12 is overwritten) and "never selects a rejected item…" (the rejected item comes back as `selected`).

- [ ] **Step 3: Implement**

In `src/lib/agents/curator.ts`, replace the start of `curateWeek`

```ts
export async function curateWeek(week: string, voice: VoiceProfile) {
  const db = getDb();
  const items = db
    .prepare("SELECT * FROM items WHERE week_key = ? AND status IN ('new','scored') ORDER BY published_at DESC LIMIT 120")
    .all(week) as Item[];
```

with:

```ts
/**
 * Scores the week's items that have no score yet — never re-scores, so a daily
 * run costs one pass over that day's new items — then re-marks the week's top
 * `signals_per_week` as selected.
 */
export async function curateWeek(week: string, voice: VoiceProfile) {
  const db = getDb();
  const items = db
    .prepare("SELECT * FROM items WHERE week_key = ? AND status = 'new' ORDER BY published_at DESC LIMIT 120")
    .all(week) as Item[];
```

and replace the selection block

```ts
  // Selection: best item per cluster, top N of the week.
  const limit = getSetting<number>("signals_per_week", 8);
  db.prepare("UPDATE items SET status = 'scored' WHERE week_key = ? AND status = 'selected'").run(week);
  const top = db
    .prepare(
      `SELECT id FROM items WHERE week_key = ? AND score IS NOT NULL
       GROUP BY COALESCE(cluster, title) HAVING score = MAX(score)
       ORDER BY score DESC LIMIT ?`,
    )
    .all(week, limit) as { id: number }[];
  const sel = db.prepare("UPDATE items SET status = 'selected' WHERE id = ?");
```

with:

```ts
  // Selection: best item per cluster, top N of the week. It runs every day now,
  // so it must not undo the radar: a rejected item is never picked, and one
  // already written about stays `used` (it still counts towards the N).
  const limit = getSetting<number>("signals_per_week", 8);
  db.prepare("UPDATE items SET status = 'scored' WHERE week_key = ? AND status = 'selected'").run(week);
  const top = db
    .prepare(
      `SELECT id FROM items WHERE week_key = ? AND score IS NOT NULL AND status != 'rejected'
       GROUP BY COALESCE(cluster, title) HAVING score = MAX(score)
       ORDER BY score DESC LIMIT ?`,
    )
    .all(week, limit) as { id: number }[];
  const sel = db.prepare("UPDATE items SET status = 'selected' WHERE id = ? AND status = 'scored'");
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run src/lib/agents/curator.test.ts`
Expected: PASS.

- [ ] **Step 5: Full check and commit**

Run: `npm run lint && npm run typecheck && npm test`

```bash
git add src/lib/agents/curator.ts src/lib/agents/curator.test.ts
git commit -m "feat: curator scores only new items and never re-selects rejected ones"
```

---

### Task 6: A channel writes from a digest definition

**Files:**
- Modify: `src/lib/channels.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/pipeline.ts` (grouping reads `digest_def`)
- Modify: `src/components/ChannelManager.tsx`
- Modify: `src/app/settings/channels/page.tsx`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/es.ts`
- Test: `src/lib/channels.test.ts` (new), `src/lib/pipeline.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/channels.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

process.env.SIGNAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "signal-channels-"));

const { getChannel, saveChannel } = await import("./channels");

const input = (digest_def: string) => ({
  key: "policy",
  label: "Policy",
  char_limit: 500,
  color: "#000000",
  hint: "",
  language: "",
  digest_def,
  template: "{{body}}",
  publisher: "manual",
  config: {},
  credential_id: null,
  posts_per_run: 1,
  enabled: true,
});

describe("saveChannel and the source digest", () => {
  it("stores the definition the channel writes from", () => {
    saveChannel(input("ai-daily"));
    expect(getChannel("policy")?.digest_def).toBe("ai-daily");
  });

  it("stores the general definition as NULL, so the channel follows it", () => {
    saveChannel(input(""));
    expect(getChannel("policy")?.digest_def).toBeNull();
    saveChannel(input("general"));
    expect(getChannel("policy")?.digest_def).toBeNull();
  });
});
```

In `src/lib/pipeline.test.ts`, replace the `channel` helper with:

```ts
const channel = (key: string, digestDef: string | null) =>
  ({ key, label: key.toUpperCase(), digest_def: digestDef }) as Channel;
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run src/lib/channels.test.ts src/lib/pipeline.test.ts`
Expected: FAIL — "stores the definition the channel writes from" (`null` instead of `"ai-daily"`), and the pipeline tests that bind a channel to `regulation` (the grouping still reads `category`).

- [ ] **Step 3: Persistence**

In `src/lib/channels.ts`:

1. In `ChannelInput`, replace

```ts
  /** Category whose digest this channel writes from. Empty = the general digest. */
  category: string;
```

with

```ts
  /** Key of the digest definition this channel writes from. Empty = the general one. */
  digest_def: string;
```

2. `type Seed = Omit<ChannelInput, "credential_id" | "config" | "language" | "category"> & {` → `type Seed = Omit<ChannelInput, "credential_id" | "config" | "language" | "digest_def"> & {`
3. In `channelLabel`'s fallback, delete the line `category: null,` (keep `digest_def: null,`).
4. In `saveChannel`'s `row`, replace `category: input.category?.trim() || null,` with:

```ts
    // NULL, not "general": an unbound channel follows the general definition.
    digest_def: input.digest_def?.trim() && input.digest_def.trim() !== "general" ? input.digest_def.trim() : null,
```

5. In `saveChannel`'s SQL, replace `category` with `digest_def` in the column list, `@category` with `@digest_def` in `VALUES`, and `category = excluded.category,` with `digest_def = excluded.digest_def,`. `channels.category` stays in the table, unused.

In `src/lib/types.ts`, delete from `Channel`:

```ts
  /** Key of the category whose digest this channel writes from. NULL = the general digest. */
  category: string | null;
```

In `src/lib/pipeline.ts`:

1. `import { getDb, getSetting, legacyDefKey } from "./db";` → `import { getDb, getSetting } from "./db";`
2. In `groupChannelsByDigest`: `const key = legacyDefKey(c.category);` → `const key = c.digest_def ?? "general";`, and in its comment "bound to a category" → "bound to a definition".

- [ ] **Step 4: Strings**

`src/lib/i18n/en.ts`, inside `channels: { … }`, replace `sourceDigest`, `generalDigest` and `sourceDigestHint` with:

```ts
    sourceDigest: "Source digest",
    sourceDigestHint:
      "The digest this channel writes from. It writes when that digest is written: every day for a daily one, on Mondays for a weekly one, on the 1st for a monthly one.",
```

and add a new section right before `promptsPage: {` (Task 9 completes it):

```ts
  digestDefs: {
    cadences: { daily: "daily", weekly: "weekly", monthly: "monthly" },
  },

```

`src/lib/i18n/es.ts`, inside `channels: { … }`, replace the same three keys with:

```ts
    sourceDigest: "Resumen de origen",
    sourceDigestHint:
      "El resumen del que salen los posts de este canal. Escribe cuando ese resumen se escribe: todos los días si es diario, los lunes si es semanal, el día 1 si es mensual.",
```

and before `promptsPage: {`:

```ts
  digestDefs: {
    cadences: { daily: "diario", weekly: "semanal", monthly: "mensual" },
  },

```

- [ ] **Step 5: The form**

In `src/components/ChannelManager.tsx`:

1. `import type { Category, Channel } from "@/lib/types";` → `import type { Channel, DigestDef } from "@/lib/types";`
2. In `Draft`, `BLANK` and `toDraft`: `category: string;` → `digest_def: string;`, `category: "",` → `digest_def: "",`, `category: c.category ?? "",` → `digest_def: c.digest_def ?? "",`.
3. In `Editor`'s and `ChannelManager`'s props (destructuring and type): `categories` → `defs`, `categories: Category[];` → `defs: DigestDef[];`. Both `<Editor … categories={categories} … />` usages → `defs={defs}`.
4. Replace the source-digest `<select>…</select>` (the one under `t.channels.sourceDigest`) with:

```tsx
          <select
            className="select"
            value={d.digest_def}
            onChange={(e) => setD({ ...d, digest_def: e.target.value })}
          >
            {/* General is the empty value: an unbound channel follows it. Then
                every enabled definition, plus the one already bound. */}
            {defs
              .filter((x) => x.key === "general" || x.enabled || x.key === d.digest_def)
              .map((x) => (
                <option key={x.key} value={x.key === "general" ? "" : x.key}>
                  {x.label} · {t.digestDefs.cadences[x.cadence]}
                </option>
              ))}
          </select>
```

5. Replace the category chip in the channel header with:

```tsx
                {c.digest_def && (
                  <span className="chip !text-[10px] !py-0">
                    {defs.find((x) => x.key === c.digest_def)?.label ?? c.digest_def}
                  </span>
                )}
```

(Do not import from `digest-defs.ts` here: it imports `getDb`, and this is a client component. The definitions come in as a prop.)

- [ ] **Step 6: The page**

In `src/app/settings/channels/page.tsx`, replace `import { getCategories } from "@/lib/categories";` with `import { getDigestDefs } from "@/lib/digest-defs";` (keep imports sorted: put it after the `channels` import), and `categories={getCategories()}` with `defs={getDigestDefs()}`.

- [ ] **Step 7: Run the tests and see them pass**

Run: `npx vitest run src/lib/channels.test.ts src/lib/pipeline.test.ts`
Expected: PASS.

- [ ] **Step 8: Full check, try it, commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all green; `grep -rn "\.category\b" src/components/ChannelManager.tsx src/lib/pipeline.ts src/lib/channels.ts` prints nothing.

```bash
git add src/lib/channels.ts src/lib/channels.test.ts src/lib/types.ts src/lib/pipeline.ts src/lib/pipeline.test.ts src/components/ChannelManager.tsx src/app/settings/channels/page.tsx src/lib/i18n/en.ts src/lib/i18n/es.ts
git commit -m "feat: a channel writes from a digest definition"
```

---

### Task 7: Run what is due, post by definition, cron parameters

**Files:**
- Modify: `src/lib/pipeline.ts` (replaced)
- Modify: `src/app/api/cron/route.ts` (replaced)
- Modify: `src/lib/actions.ts` (`actionRelaunchRun`)
- Modify: `src/app/runs/[id]/page.tsx` (`statRows`)
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/es.ts` (`runs.relaunchHint`)
- Test: `src/lib/pipeline.test.ts` (replaced)

- [ ] **Step 1: Write the failing tests**

Replace `src/lib/pipeline.test.ts` with:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { Channel, DigestDef } from "./types";

// The due rules read the local calendar: pin the cluster's time zone.
process.env.TZ = "America/Argentina/Buenos_Aires";
// Demo mode whatever the shell exports: these tests must never call a real model.
for (const k of ["SIGNAL_LLM_PROVIDER", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY", "LLM_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"]) {
  delete process.env[k];
}
process.env.SIGNAL_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "signal-pipeline-"));

const { getDb } = await import("./db");
const { getChannels } = await import("./channels");
const { curateWeeks, dueTargets, groupChannelsByTarget, resolveTargets, runPipeline } = await import("./pipeline");

const THURSDAY = new Date(2026, 9, 22, 8, 0); // an ordinary day
const MONDAY = new Date(2026, 9, 26, 8, 0);
const FIRST = new Date(2026, 10, 1, 8, 0); // a Sunday, the 1st

const def = (key: string, cadence: DigestDef["cadence"], over: Partial<DigestDef> = {}): DigestDef => ({
  id: 0,
  key,
  label: key.toUpperCase(),
  kind: "items",
  cadence,
  categories: [],
  sources: [],
  item_count: 8,
  enabled: 1,
  sort_order: 100,
  ...over,
});
const DEFS = [def("general", "weekly"), def("daily", "daily"), def("monthly", "monthly"), def("off", "daily", { enabled: 0 })];
const pairs = (targets: { def: DigestDef; period: string }[]) => targets.map((t) => [t.def.key, t.period]);

const channel = (key: string, digestDef: string | null) =>
  ({ key, label: key.toUpperCase(), digest_def: digestDef }) as Channel;
const digest = (defKey: string, period: string) =>
  Number(
    getDb()
      .prepare("INSERT INTO digests (def_key, period_key, title) VALUES (?, ?, 't')")
      .run(defKey, period).lastInsertRowid,
  );

beforeEach(() => {
  getDb().exec("DELETE FROM posts; DELETE FROM digests; DELETE FROM runs;");
});

describe("dueTargets", () => {
  it("writes only the daily definitions on an ordinary day, for yesterday", () => {
    expect(pairs(dueTargets(DEFS, THURSDAY))).toEqual([["daily", "2026-10-21"]]);
  });

  it("adds the weekly ones on Monday, for the week that closed", () => {
    expect(pairs(dueTargets(DEFS, MONDAY))).toEqual([
      ["general", "2026-W43"],
      ["daily", "2026-10-25"],
    ]);
  });

  it("adds the monthly ones on the 1st, for the month that closed", () => {
    expect(pairs(dueTargets(DEFS, FIRST))).toEqual([
      ["daily", "2026-10-31"],
      ["monthly", "2026-10"],
    ]);
  });
});

describe("resolveTargets", () => {
  it("runs what is due when nothing is named", () => {
    expect(pairs(resolveTargets({}, DEFS, MONDAY))).toEqual(pairs(dueTargets(DEFS, MONDAY)));
  });

  it("writes named definitions for the period asked, previous by default, even a disabled one", () => {
    expect(pairs(resolveTargets({ defs: ["daily", "off"] }, DEFS, THURSDAY))).toEqual([
      ["daily", "2026-10-21"],
      ["off", "2026-10-21"],
    ]);
    expect(pairs(resolveTargets({ defs: ["general"], period: "current" }, DEFS, THURSDAY))).toEqual([
      ["general", "2026-W43"],
    ]);
    expect(pairs(resolveTargets({ defs: ["daily"], period: "2026-10-01" }, DEFS, THURSDAY))).toEqual([
      ["daily", "2026-10-01"],
    ]);
  });

  it("keeps the legacy week: every enabled weekly definition on that week", () => {
    expect(pairs(resolveTargets({ week: "previous" }, DEFS, MONDAY))).toEqual([["general", "2026-W43"]]);
  });

  it("replays exact pairs", () => {
    expect(pairs(resolveTargets({ targets: [{ def: "daily", period: "2026-10-05" }] }, DEFS, THURSDAY))).toEqual([
      ["daily", "2026-10-05"],
    ]);
  });

  it("refuses an unknown definition, a period of the wrong cadence, and a period without defs", () => {
    expect(() => resolveTargets({ defs: ["nope"] }, DEFS, THURSDAY)).toThrow('Unknown digest "nope"');
    expect(() => resolveTargets({ defs: ["daily"], period: "2026-W40" }, DEFS, THURSDAY)).toThrow(/Unknown daily period/);
    expect(() => resolveTargets({ period: "previous" }, DEFS, THURSDAY)).toThrow(/needs "defs"/);
  });
});

describe("curateWeeks", () => {
  it("curates the current week, and the one that closed on Monday", () => {
    expect(curateWeeks({}, [], THURSDAY)).toEqual(["2026-W43"]);
    expect(curateWeeks({}, [], MONDAY)).toEqual(["2026-W44", "2026-W43"]);
  });

  it("curates only the legacy week when one is given", () => {
    expect(curateWeeks({ week: "previous" }, [], MONDAY)).toEqual(["2026-W43"]);
  });

  it("adds the weeks a named digest covers", () => {
    const targets = resolveTargets({ defs: ["daily"], period: "2026-10-05" }, DEFS, THURSDAY);
    expect(curateWeeks({ defs: ["daily"] }, targets, THURSDAY)).toEqual(["2026-W43", "2026-W41"]);
  });
});

describe("groupChannelsByTarget", () => {
  const targets = [
    { def: def("general", "weekly"), period: "2026-W43" },
    { def: def("daily", "daily"), period: "2026-10-25" },
  ];

  it("sends each channel to the digest of its definition written in this run", () => {
    const plan = groupChannelsByTarget(
      targets,
      new Map([
        ["general", 11],
        ["daily", 12],
      ]),
      [channel("linkedin", null), channel("x", "general"), channel("pulse", "daily")],
    );
    expect(plan.skipped).toEqual([]);
    expect(plan.groups.map((g) => [g.digestId, g.channels.map((c) => c.key)])).toEqual([
      [11, ["linkedin", "x"]],
      [12, ["pulse"]],
    ]);
  });

  it("says nothing about a channel whose definition is not due", () => {
    const plan = groupChannelsByTarget(targets, new Map([["general", 11]]), [channel("monthly-news", "monthly")]);
    expect(plan).toEqual({ groups: [], skipped: [] });
  });

  it("warns about the channels of a due definition that was skipped", () => {
    const plan = groupChannelsByTarget(targets, new Map([["general", 11]]), [channel("pulse", "daily")]);
    expect(plan.skipped).toEqual(['Channels PULSE skipped: no "DAILY" digest for 2026-10-25.']);
  });

  it("uses the stored digest when the digest stage did not run", () => {
    const id = digest("daily", "2026-10-25");
    const plan = groupChannelsByTarget(targets, null, [channel("pulse", "daily"), channel("linkedin", null)]);
    expect(plan.groups.map((g) => g.digestId)).toEqual([id]);
    expect(plan.skipped).toEqual(['Channels LINKEDIN skipped: no "GENERAL" digest for 2026-W43.']);
  });
});

describe("runPipeline", () => {
  const db = () => getDb();

  beforeEach(() => {
    db().exec("DELETE FROM items; DELETE FROM sources; DELETE FROM digest_defs; DELETE FROM channels;");
    getChannels(); // seeds the shipped channels...
    db().exec("UPDATE channels SET enabled = 0"); // ...which these tests do not want
    db().exec(`
      INSERT INTO digest_defs (key, label, cadence, item_count, sort_order) VALUES
        ('general', 'General', 'weekly', 8, 0), ('pulse', 'Pulse', 'daily', 3, 10), ('month', 'Month', 'monthly', 3, 20);
      INSERT INTO channels (key, label, digest_def, posts_per_run, enabled) VALUES
        ('weekly-ch', 'Weekly', NULL, 1, 1), ('pulse-ch', 'Pulse', 'pulse', 1, 1), ('month-ch', 'Month', 'month', 1, 1);
      INSERT INTO items (external_id, title, url, week_key, score, status, published_at) VALUES
        ('a', 'Last week', 'https://a', '2026-W43', 80, 'selected', '2026-10-24T15:00:00.000Z'),
        ('b', 'Sunday', 'https://b', '2026-W43', 70, 'scored', '2026-10-25T15:00:00.000Z');
    `);
  });

  it("on a Monday writes the daily and the weekly digests, and posts only for them", async () => {
    const res = await runPipeline(["digest", "posts"], { now: MONDAY });
    expect(res.ok).toBe(true);
    expect(db().prepare("SELECT def_key, period_key FROM digests ORDER BY def_key").all()).toEqual([
      { def_key: "general", period_key: "2026-W43" },
      { def_key: "pulse", period_key: "2026-10-25" },
    ]);
    expect(
      (db().prepare("SELECT DISTINCT platform FROM posts ORDER BY platform").all() as { platform: string }[]).map(
        (r) => r.platform,
      ),
    ).toEqual(["pulse-ch", "weekly-ch"]);
    expect(res.log.join("\n")).not.toMatch(/MONTH|month-ch/i);
    expect(res.stats.targets).toEqual([
      { def: "general", period: "2026-W43" },
      { def: "pulse", period: "2026-10-25" },
    ]);
  });

  it("on an ordinary day with nothing scored skips the daily digest with a warning, and still succeeds", async () => {
    const res = await runPipeline(["digest", "posts"], { now: THURSDAY });
    expect(res.ok).toBe(true);
    expect(res.log).toContain('⚠ Digest "Pulse" 2026-10-21 skipped: no scored items.');
    expect(res.log).toContain('⚠ Channels Pulse skipped: no "Pulse" digest for 2026-10-21.');
    expect(db().prepare("SELECT COUNT(*) c FROM posts").get()).toEqual({ c: 0 });
  });

  it("keeps the legacy week working for the general digest", async () => {
    const res = await runPipeline(["digest"], { week: "2026-W43", now: THURSDAY });
    expect(res.ok).toBe(true);
    expect(db().prepare("SELECT def_key, period_key, week_key FROM digests").all()).toEqual([
      { def_key: "general", period_key: "2026-W43", week_key: "2026-W43" },
    ]);
  });

  it("reports a bad request before opening a run", async () => {
    const res = await runPipeline(["digest"], { defs: ["nope"] });
    expect(res).toMatchObject({ ok: false, runId: null });
    expect(db().prepare("SELECT COUNT(*) c FROM runs").get()).toEqual({ c: 0 });
  });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run src/lib/pipeline.test.ts`
Expected: FAIL — `dueTargets is not a function` (and `resolveTargets`, `curateWeeks`, `groupChannelsByTarget`).

- [ ] **Step 3: Implement the runner**

Replace `src/lib/pipeline.ts` with:

```ts
import { getChannels } from "./channels";
import { getDb, getSetting } from "./db";
import { ingestAll } from "./ingest";
import { curateWeek } from "./agents/curator";
import { buildDigestFor } from "./agents/digest";
import { getDigestDefs } from "./digest-defs";
import { writePosts } from "./agents/writer";
import { llmStatus } from "./llm";
import { isDue, periodWeeks, previousPeriod, resolvePeriod, type PeriodKey } from "./periods";
import { finishRun, startRun, type RunTrigger } from "./runs";
import { DEFAULT_VOICE, type Channel, type DigestDef, type VoiceProfile } from "./types";
import { previousWeekKey, resolveWeek, weekKey, type WeekKey } from "./weeks";

export function getVoice(): VoiceProfile {
  return { ...DEFAULT_VOICE, ...getSetting<Partial<VoiceProfile>>("voice", {}) };
}

export type Stage = "ingest" | "curate" | "digest" | "posts";

export const STAGES: { key: Stage; label: string }[] = [
  { key: "ingest", label: "Ingest sources" },
  { key: "curate", label: "Curate" },
  { key: "digest", label: "Digests" },
  { key: "posts", label: "Write posts" },
];

export const ALL_STAGES: Stage[] = STAGES.map((s) => s.key);

/** Keeps the canonical order whatever order the caller listed the stages in. */
export function parseStages(raw: string | null | undefined): Stage[] {
  if (!raw?.trim()) return ALL_STAGES;
  const asked = raw.split(",").map((s) => s.trim());
  const unknown = asked.filter((s) => s && !ALL_STAGES.includes(s as Stage));
  if (unknown.length) {
    throw new Error(`Unknown stage "${unknown[0]}". Available: ${ALL_STAGES.join(", ")}.`);
  }
  return ALL_STAGES.filter((s) => asked.includes(s));
}

export type RunOptions = {
  /**
   * Legacy, from before digest definitions: `current`, `previous` or an ISO
   * week. Curates that week only and writes every enabled weekly definition
   * for it — the general digest included, as the old weekly schedule expects.
   */
  week?: string;
  /** Write these definitions instead of what is due. */
  defs?: string[];
  /** `current`, `previous` (the default) or a period key, for `defs`. */
  period?: string;
  /** Exact definition + period pairs. What "Run again" replays. */
  targets?: { def: string; period: string }[];
  /** The clock the due rules read. Tests and manual checks set it. */
  now?: Date;
  trigger?: RunTrigger;
};

export type PipelineResult = {
  ok: boolean;
  runId: number | null;
  week: WeekKey | null;
  log: string[];
  stats: Record<string, unknown>;
  error?: string;
};

/** One digest a run works on: a definition and the period it covers. */
export type DigestTarget = { def: DigestDef; period: PeriodKey };

/**
 * What a run at `now` writes when nobody names anything: every enabled item
 * definition whose cadence is due — daily every day, weekly on Monday, monthly
 * on the 1st — each for the period that just closed.
 */
export function dueTargets(defs: DigestDef[], now: Date): DigestTarget[] {
  return defs
    .filter((d) => d.enabled && d.kind === "items" && isDue(d.cadence, now))
    .map((def) => ({ def, period: previousPeriod(def.cadence, now) }));
}

/** The digests a run works on, from its options. Throws on a bad request. */
export function resolveTargets(options: RunOptions, defs: DigestDef[], now: Date): DigestTarget[] {
  const find = (key: string) => {
    const def = defs.find((d) => d.key === key);
    if (!def) throw new Error(`Unknown digest "${key}". Available: ${defs.map((d) => d.key).join(", ")}.`);
    if (def.kind !== "items") throw new Error(`"${def.label}" is a roll-up: roll-ups are not available yet.`);
    return def;
  };
  if (options.targets) {
    return options.targets.map((t) => {
      const def = find(t.def);
      return { def, period: resolvePeriod(def.cadence, t.period, now) };
    });
  }
  if (options.defs?.length) {
    return [...new Set(options.defs)].map((key) => {
      const def = find(key);
      return { def, period: resolvePeriod(def.cadence, options.period, now) };
    });
  }
  if (options.period) throw new Error('"period" needs "defs": it says which period of which digests.');
  if (options.week) {
    const week = resolveWeek(options.week, now);
    return defs
      .filter((d) => d.enabled && d.kind === "items" && d.cadence === "weekly")
      .map((def) => ({ def, period: week }));
  }
  return dueTargets(defs, now);
}

/**
 * The weeks the curate stage scores. The current week every day, and on
 * Monday the one that just closed too, so its last day is scored before the
 * weekly digest is written. A legacy `week` replaces both. Digests asked for
 * by name add the weeks they cover.
 */
export function curateWeeks(options: RunOptions, targets: DigestTarget[], now: Date): WeekKey[] {
  const weeks = options.week
    ? [resolveWeek(options.week, now)]
    : [weekKey(now), ...(now.getDay() === 1 ? [previousWeekKey(now)] : [])];
  if (options.targets || options.defs?.length) {
    for (const t of targets) weeks.push(...periodWeeks(t.period));
  }
  return [...new Set(weeks)];
}

export type PostGroup = { digestId: number; defKey: string; period: PeriodKey; channels: Channel[] };

/**
 * The posts stage, planned: one group per digest of this run that a channel
 * writes from. A channel follows its definition (`digest_def`, NULL = general)
 * and writes only when that definition is one of the run's targets — on any
 * other day it writes nothing, and that is not a warning.
 *
 * `written` holds the digests the digest stage wrote in this same run; a
 * target missing from it was skipped or failed, and its channels are skipped
 * with a warning. When the digest stage did not run (the run dialog runs one
 * stage per call), `written` is null and the stored digest of each target is
 * used instead.
 */
export function groupChannelsByTarget(
  targets: DigestTarget[],
  written: Map<string, number> | null,
  channels: Channel[],
): { groups: PostGroup[]; skipped: string[] } {
  const find = getDb().prepare("SELECT id FROM digests WHERE def_key = ? AND period_key = ?");
  const groups: PostGroup[] = [];
  const skipped: string[] = [];
  for (const { def, period } of targets) {
    const list = channels.filter((c) => (c.digest_def ?? "general") === def.key);
    if (!list.length) continue;
    const id = written
      ? written.get(def.key)
      : (find.get(def.key, period) as { id: number } | undefined)?.id;
    if (id !== undefined) groups.push({ digestId: id, defKey: def.key, period, channels: list });
    else skipped.push(`Channels ${list.map((c) => c.label).join(", ")} skipped: no "${def.label}" digest for ${period}.`);
  }
  return { groups, skipped };
}

export async function runPipeline(
  stages: Stage[] = ALL_STAGES,
  options: RunOptions = {},
): Promise<PipelineResult> {
  const voice = getVoice();
  const log: string[] = [];
  const now = options.now ?? new Date();

  // Resolving what to work on and claiming the slot both happen before there
  // is a run to record the failure in, so they report back the same shape as
  // any other failure rather than throwing at the caller.
  let week: WeekKey;
  let targets: DigestTarget[];
  let weeks: WeekKey[];
  let runId: number;
  try {
    week = options.week ? resolveWeek(options.week, now) : weekKey(now);
    targets = resolveTargets(options, getDigestDefs(), now);
    weeks = curateWeeks(options, targets, now);
    runId = startRun({ stages, week, trigger: options.trigger ?? "ui" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, runId: null, week: null, log: [`✖ ${msg}`], stats: {}, error: msg };
  }

  // `targets` is what "Run again" replays.
  const stats: Record<string, unknown> = {
    week,
    targets: targets.map((t) => ({ def: t.def.key, period: t.period })),
  };

  const status = llmStatus();
  if (!status.ready && stages.some((s) => s !== "ingest")) {
    log.push(`⚠ ${status.reason} Running in demo mode: the text is filler.`);
  }

  try {
    if (stages.includes("ingest")) {
      const r = await ingestAll();
      stats.ingest = r;
      log.push(`Ingest: ${r.inserted} new out of ${r.found} items across ${r.sources} sources.`);
      r.errors.forEach((e) => log.push(`⚠ ${e}`));
    }
    if (stages.includes("curate")) {
      const curated: Record<string, unknown>[] = [];
      for (const w of weeks) {
        const r = await curateWeek(w, voice);
        curated.push({ week: w, ...r });
        log.push(`Curation ${w}: ${r.scored} scored, ${r.selected} selected, ${r.images} images found.`);
      }
      stats.curate = curated;
    }
    // Keyed by definition: a run has at most one period per definition.
    const written = new Map<string, number>();
    if (stages.includes("digest")) {
      const digests: Record<string, unknown>[] = [];
      if (!targets.length) log.push("No digest is due in this run.");
      for (const { def, period } of targets) {
        try {
          const r = await buildDigestFor(def, period, voice);
          digests.push({ def: def.key, period, ...r });
          if ("skipped" in r) {
            log.push(`⚠ Digest "${def.label}" ${period} skipped: no scored items.`);
          } else {
            written.set(def.key, r.digestId);
            log.push(`Digest "${def.label}" ${period}: ${r.items} signals.`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          digests.push({ def: def.key, period, error: msg });
          log.push(`⚠ Digest "${def.label}" ${period} failed: ${msg}`);
        }
      }
      stats.digests = digests;
      // One failing definition is a warning; all of them failing is a failed run.
      if (digests.length && digests.every((d) => "error" in d)) {
        throw new Error(`Every digest failed. The first one: ${String(digests[0].error)}`);
      }
    }
    if (stages.includes("posts")) {
      const channels = getChannels(true).filter((c) => c.posts_per_run > 0);
      if (!channels.length) throw new Error("No channel is enabled. Enable one under Channels.");
      const plan = groupChannelsByTarget(targets, stages.includes("digest") ? written : null, channels);
      plan.skipped.forEach((s) => log.push(`⚠ ${s}`));
      let created = 0;
      let channelCount = 0;
      for (const g of plan.groups) {
        const r = await writePosts(g.digestId, voice, g.channels);
        created += r.created;
        channelCount += r.channels;
      }
      stats.posts = { created, channels: channelCount };
      log.push(
        plan.groups.length || plan.skipped.length
          ? `Writing: ${created} drafts across ${channelCount} channels.`
          : "Writing: no channel writes from the digests of this run.",
      );
    }

    finishRun(runId, { status: "ok", stats, log });
    return { ok: true, runId, week, log, stats };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.push(`✖ ${msg}`);
    finishRun(runId, { status: "error", stats, log });
    return { ok: false, runId, week, log, stats, error: msg };
  }
}
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run src/lib/pipeline.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 5: The cron route**

Replace `src/app/api/cron/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { parseStages, runPipeline } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled pipeline run, once a day:
 *   0 8 * * * curl -sS -H "authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron
 *
 * With no parameters it writes what is due: daily definitions every day (for
 * yesterday), weekly ones on Monday (for the week that closed), monthly ones
 * on the 1st (for the month that closed).
 *
 * - `stages=ingest,curate` runs part of the pipeline.
 * - `defs=general,ai-daily` writes those definitions instead of what is due,
 *   for `period=` `previous` (the default), `current` or a key such as
 *   `2026-10-23`, `2026-W43` or `2026-10`.
 * - `week=previous` (or `current`, or `2026-W43`) is the old weekly schedule:
 *   it curates that week and writes every enabled weekly definition for it.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(req.url);

  let stages;
  try {
    stages = parseStages(url.searchParams.get("stages"));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const defs = url.searchParams.get("defs");
  const res = await runPipeline(stages, {
    week: url.searchParams.get("week") ?? undefined,
    defs: defs ? defs.split(",").map((d) => d.trim()).filter(Boolean) : undefined,
    period: url.searchParams.get("period") ?? undefined,
    trigger: "cron",
  });
  return NextResponse.json(res, { status: res.ok ? 200 : 500 });
}
```

- [ ] **Step 6: Run again replays the same digests**

In `src/lib/actions.ts`, `import { getRun, runStages } from "./runs";` → `import { getRun, runStages, runStats } from "./runs";`, and replace `actionRelaunchRun` and its comment with:

```ts
/**
 * Runs a past run again: same stages, same week, same digests. A run recorded
 * before digest definitions has no `targets`, and replays as the old weekly
 * run of its week.
 */
export async function actionRelaunchRun(id: number) {
  const run = getRun(id);
  if (!run) return { ok: false, runId: null, week: null, log: [], stats: {}, error: "Run not found" };
  const targets = runStats(run).targets;
  const res = await runPipeline(runStages(run), {
    week: run.week_key ?? undefined,
    targets: Array.isArray(targets) ? (targets as { def: string; period: string }[]) : undefined,
    trigger: "ui",
  });
  revalidatePath("/", "layout");
  return res;
}
```

In `src/lib/i18n/en.ts`, inside `runs: { … }`, replace the `relaunchHint` line with:

```ts
    relaunchHint: (week: string) => `Runs the same stages again, on ${week} and the same digests.`,
```

In `src/lib/i18n/es.ts`, inside `runs: { … }`, replace the `relaunchHint` line with:

```ts
    relaunchHint: (week: string) => `Vuelve a correr las mismas etapas, sobre ${week} y los mismos resúmenes.`,
```

- [ ] **Step 7: The run page shows lists**

`stats.digests`, `stats.curate` and `stats.targets` are now lists. In `src/app/runs/[id]/page.tsx`, replace `statRows` and its comment with:

```tsx
/** One value on one line: a list by its length, an object as `key: value · …`. */
function describeValue(value: unknown): string {
  if (Array.isArray(value)) return String(value.length);
  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${describeValue(v)}`)
      .join(" · ");
  }
  return String(value);
}

/**
 * The per-stage numbers the pipeline recorded, flattened into readable rows.
 * A stage that recorded a list (one entry per digest, per curated week) gets
 * one row per entry.
 */
function statRows(stats: Record<string, unknown>): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  for (const [stage, value] of Object.entries(stats)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      if (!value.length) rows.push({ label: stage, value: "—" });
      value.forEach((entry, i) => rows.push({ label: `${stage}.${i + 1}`, value: describeValue(entry) }));
      continue;
    }
    if (typeof value !== "object") {
      rows.push({ label: stage, value: String(value) });
      continue;
    }
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      rows.push({ label: `${stage}.${key}`, value: describeValue(inner) });
    }
  }
  return rows;
}
```

- [ ] **Step 8: Full check and commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all green. The run dialog still sends `{ week }`, which now means "every enabled weekly definition for that week" — it keeps working until Task 8.

```bash
git add src/lib/pipeline.ts src/lib/pipeline.test.ts src/app/api/cron/route.ts src/lib/actions.ts "src/app/runs/[id]/page.tsx" src/lib/i18n/en.ts src/lib/i18n/es.ts
git commit -m "feat: run what is due — daily, weekly, monthly — and post by definition"
```

---

### Task 8: Run dialog — what is due, or one definition and a period

**Files:**
- Modify: `src/components/RunButton.tsx` (replaced)
- Modify: `src/app/layout.tsx`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/es.ts`

No unit test: UI over the tested `resolveTargets`. Verified by typecheck, build and by hand.

- [ ] **Step 1: Strings**

`src/lib/i18n/en.ts`, inside `run: { … }`, replace `week`, `weekCurrent`, `weekPrevious` and `weekHint` with:

```ts
    digests: "Digests",
    due: "What is due now",
    dueNow: (labels: string) =>
      `Due now: ${labels}. Daily digests are due every day, weekly ones on Monday, monthly ones on the 1st — each for the period that just closed.`,
    nothingDue:
      "Nothing is due now. Daily digests are due every day, weekly ones on Monday, monthly ones on the 1st.",
    period: "Period",
    periodCurrent: "Current",
    periodPrevious: "Previous",
    periodKey: "Period key",
    periodInvalid: (example: string) => `Not a period of this digest. Example: ${example}`,
    scopeHint:
      "Ingest always reads every source. Curation scores the current week, and on Monday the one that closed too. The digests and the posts work on what is picked here.",
```

and in `run.stages`, replace the `digest` and `posts` entries with:

```ts
      digest: {
        label: "Digests",
        hint: "Writes the digests picked above from the best signals of their period.",
      },
      posts: { label: "Write posts", hint: "Drafts posts for the channels of those digests." },
```

`src/lib/i18n/es.ts`, inside `run: { … }`, replace the same four keys with:

```ts
    digests: "Resúmenes",
    due: "Lo que toca ahora",
    dueNow: (labels: string) =>
      `Tocan ahora: ${labels}. Los resúmenes diarios tocan todos los días, los semanales los lunes, los mensuales el día 1 — cada uno sobre el período que acaba de cerrar.`,
    nothingDue:
      "Ahora no toca ninguno. Los resúmenes diarios tocan todos los días, los semanales los lunes, los mensuales el día 1.",
    period: "Período",
    periodCurrent: "Actual",
    periodPrevious: "Anterior",
    periodKey: "Clave del período",
    periodInvalid: (example: string) => `No es un período de este resumen. Ejemplo: ${example}`,
    scopeHint:
      "Leer fuentes siempre recorre todas. La curación puntúa la semana actual, y los lunes también la que cerró. Los resúmenes y los posts trabajan sobre lo que elijas acá.",
```

and in `run.stages`:

```ts
      digest: {
        label: "Resúmenes",
        hint: "Escribe los resúmenes elegidos arriba con las mejores señales de su período.",
      },
      posts: { label: "Escribir posts", hint: "Redacta borradores para los canales de esos resúmenes." },
```

- [ ] **Step 2: The dialog**

Replace `src/components/RunButton.tsx` with:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionRunPipeline } from "@/lib/actions";
import { useT } from "./I18nProvider";
import { isDue, isPeriodKey, periodKey, type Cadence } from "@/lib/periods";
import type { RunOptions, Stage } from "@/lib/pipeline";

/** What the dialog needs to know about a digest definition. */
export type RunDef = { key: string; label: string; cadence: Cadence };

const STAGE_KEYS: Stage[] = ["ingest", "curate", "digest", "posts"];

/** `skipped` is what the stages after a failure get: the chain stops there. */
type StageState = "queued" | "running" | "ok" | "error" | "skipped";
type StageProgress = { state: StageState; log: string[] };
type Progress = Partial<Record<Stage, StageProgress>>;

function Indicator({ state }: { state: StageState }) {
  if (state === "running") {
    return (
      <span
        className="w-3 h-3 mt-0.5 shrink-0 rounded-full border-2 border-transparent animate-spin"
        style={{ borderTopColor: "var(--accent)", borderRightColor: "var(--accent)" }}
      />
    );
  }
  const glyph = { queued: "·", ok: "✓", error: "✖", skipped: "—" }[state];
  const color = { queued: "var(--faint)", ok: "var(--good)", error: "var(--bad)", skipped: "var(--faint)" }[
    state
  ];
  return (
    <span className="w-3 text-center text-[12px] leading-4 shrink-0" style={{ color }}>
      {glyph}
    </span>
  );
}

export default function RunButton({ defs }: { defs: RunDef[] }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Stage[]>(["ingest", "curate", "digest", "posts"]);
  // "" = what is due now; otherwise the key of one definition.
  const [target, setTarget] = useState("");
  const [period, setPeriod] = useState("previous");
  const [progress, setProgress] = useState<Progress>({});
  const [elapsed, setElapsed] = useState(0);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useT();

  const STAGES = STAGE_KEYS.map((key) => ({ key, ...t.run.stages[key] }));

  const picked = defs.find((d) => d.key === target);
  const periodOk = !picked || period === "current" || period === "previous" || isPeriodKey(picked.cadence, period);
  const options: RunOptions = picked ? { defs: [picked.key], period } : {};

  // A stage is one call now, so the run follows the canonical order, not the
  // order the checkboxes were clicked in.
  const plan = STAGES.filter((s) => sel.includes(s.key)).map((s) => s.key);
  const done = STAGES.filter((s) => {
    const state = progress[s.key]?.state;
    return state === "ok" || state === "error";
  }).length;
  const current = STAGES.find((s) => progress[s.key]?.state === "running");
  const total = Object.keys(progress).length;

  // Long stages say nothing while they work; the clock at least shows it is alive.
  useEffect(() => {
    if (!pending) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [pending]);

  function run() {
    setElapsed(0);
    setProgress(Object.fromEntries(plan.map((k) => [k, { state: "queued", log: [] }])));
    start(async () => {
      for (const [i, stage] of plan.entries()) {
        setProgress((p) => ({ ...p, [stage]: { state: "running", log: [] } }));
        const res = await actionRunPipeline([stage], options);
        setProgress((p) => ({
          ...p,
          [stage]: { state: res.ok ? "ok" : "error", log: res.log },
          // The pipeline aborts on the first error, so the rest never runs.
          ...(res.ok
            ? {}
            : Object.fromEntries(
                plan.slice(i + 1).map((k) => [k, { state: "skipped" as const, log: [] }]),
              )),
        }));
        if (!res.ok) break;
      }
      router.refresh();
    });
  }

  return (
    <>
      <button className="btn btn-primary w-full justify-center" onClick={() => setOpen(true)}>
        {pending ? t.run.running : t.run.button}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-6"
          onClick={(e) => e.target === e.currentTarget && !pending && setOpen(false)}
        >
          <div className="card w-full max-w-lg p-6" style={{ background: "var(--surface)" }}>
            <h2 className="text-[15px] font-semibold mb-1">{t.run.title}</h2>
            <p className="text-[12.5px] text-muted mb-5">{t.run.intro}</p>

            <div className="mb-5 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="kicker">{t.run.digests}</span>
                <select
                  className="select !w-auto"
                  value={target}
                  disabled={pending}
                  onChange={(e) => {
                    setTarget(e.target.value);
                    setPeriod("previous");
                  }}
                >
                  <option value="">{t.run.due}</option>
                  {defs.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.label} · {t.digestDefs.cadences[d.cadence]}
                    </option>
                  ))}
                </select>
              </div>
              {picked ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="kicker">{t.run.period}</span>
                  {(["previous", "current"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      disabled={pending}
                      onClick={() => setPeriod(p)}
                      className={`chip ${period === p ? "!text-ink !border-line-strong" : ""}`}
                    >
                      {p === "current" ? t.run.periodCurrent : t.run.periodPrevious}
                    </button>
                  ))}
                  <input
                    className="input !w-36 font-mono !text-[12px]"
                    disabled={pending}
                    placeholder={periodKey(picked.cadence)}
                    aria-label={t.run.periodKey}
                    value={period === "current" || period === "previous" ? "" : period}
                    onChange={(e) => setPeriod(e.target.value.trim() || "previous")}
                  />
                  {!periodOk && (
                    <span className="text-[11.5px]" style={{ color: "var(--bad)" }}>
                      {t.run.periodInvalid(periodKey(picked.cadence))}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-[11.5px] text-faint leading-snug">
                  {(() => {
                    const due = defs.filter((d) => isDue(d.cadence, new Date())).map((d) => d.label);
                    return due.length ? t.run.dueNow(due.join(", ")) : t.run.nothingDue;
                  })()}
                </p>
              )}
              <p className="text-[11.5px] text-faint leading-snug">{t.run.scopeHint}</p>
            </div>

            <div className="flex flex-col gap-1.5 mb-5 max-h-[55vh] overflow-auto">
              {STAGES.map((s) => {
                const st = progress[s.key];
                return (
                  <label
                    key={s.key}
                    className={`flex items-start gap-2.5 px-3 py-2 rounded-md border border-line text-[13px] ${
                      pending ? "opacity-90" : "cursor-pointer hover:bg-surface-2"
                    }`}
                  >
                    {pending && st ? (
                      <Indicator state={st.state} />
                    ) : (
                      <input
                        type="checkbox"
                        className="accent-[var(--accent)] mt-0.5"
                        checked={sel.includes(s.key)}
                        disabled={pending}
                        onChange={(e) =>
                          setSel((prev) =>
                            e.target.checked ? [...prev, s.key] : prev.filter((x) => x !== s.key),
                          )
                        }
                      />
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        {s.label}
                        {!pending && st && <Indicator state={st.state} />}
                      </span>
                      <span className="block text-[11.5px] text-faint mt-0.5">
                        {st?.state === "running"
                          ? t.common.working
                          : st?.state === "skipped"
                            ? t.run.notRun
                            : s.hint}
                      </span>
                      {st && st.log.length > 0 && (
                        <pre
                          className="text-[11.5px] font-mono mt-2 whitespace-pre-wrap leading-relaxed max-h-28 overflow-auto"
                          style={{ color: st.state === "error" ? "var(--bad)" : "var(--muted)" }}
                        >
                          {st.log.join("\n")}
                        </pre>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>

            {total > 0 && (
              <div className="mb-5">
                <div className="h-[3px] rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                  <div
                    className="h-full transition-[width] duration-300"
                    style={{ width: `${(done / total) * 100}%`, background: "var(--accent)" }}
                  />
                </div>
                <div className="text-[11.5px] text-faint mt-2 font-mono">
                  {pending
                    ? t.run.progressRunning(
                        Math.min(done + 1, total),
                        total,
                        current?.label ?? t.run.starting,
                        elapsed,
                      )
                    : t.run.progressDone(done, total, elapsed)}
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={pending}>
                {t.common.close}
              </button>
              <button className="btn btn-primary" onClick={run} disabled={pending || !plan.length || !periodOk}>
                {pending ? `${current?.label ?? t.run.starting}…` : t.run.start}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

It value-imports only `@/lib/periods` (pure). `RunOptions` and `Stage` are type imports.

- [ ] **Step 3: The layout passes the definitions**

In `src/app/layout.tsx`, add after `import RunButton from "@/components/RunButton";`:

```ts
import { getDigestDefs } from "@/lib/digest-defs";
```

and replace `<RunButton />` with:

```tsx
              <RunButton
                defs={getDigestDefs(true)
                  .filter((d) => d.kind === "items")
                  .map(({ key, label, cadence }) => ({ key, label, cadence }))}
              />
```

- [ ] **Step 4: Check and try it**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all green, build succeeds.

By hand (against a copy of the database, see Task 12 Step 3): open the dialog; "What is due now" lists what is due today; pick "General · weekly", "Previous", run digest + posts — the run log names `2026-Wnn`; type a malformed key — the Run button disables and the hint shows an example.

- [ ] **Step 5: Commit**

```bash
git add src/components/RunButton.tsx src/app/layout.tsx src/lib/i18n/en.ts src/lib/i18n/es.ts
git commit -m "feat: run dialog — what is due or one digest and period"
```

---

### Task 9: Settings → Digests

**Files:**
- Create: `src/components/DigestDefManager.tsx`
- Create: `src/app/settings/digests/page.tsx`
- Modify: `src/lib/actions.ts`
- Modify: `src/components/SettingsTabs.tsx`, `src/components/Nav.tsx`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/es.ts`

No unit test: thin actions over the tested module. Verified by typecheck, build and by hand.

- [ ] **Step 1: Actions**

In `src/lib/actions.ts`, add after the `credentials` import:

```ts
import { deleteDigestDef, saveDigestDef, type DigestDefInput } from "./digest-defs";
```

Add `"/settings/digests"` to `revalidateCategories`:

```ts
function revalidateCategories() {
  for (const p of ["/sources", "/radar", "/digest", "/settings/channels", "/settings/digests"]) revalidatePath(p);
}
```

and add this section right before `/* ---------- channels ---------- */`:

```ts
/* ---------- digest definitions ---------- */

function revalidateDigestDefs() {
  for (const p of ["/settings/digests", "/settings/channels", "/digest"]) revalidatePath(p);
  // The run dialog in the sidebar lists the definitions.
  revalidatePath("/", "layout");
}

export async function actionSaveDigestDef(input: DigestDefInput): Promise<Result> {
  const res = await guard(() => {
    saveDigestDef(input);
  });
  revalidateDigestDefs();
  return res;
}

export async function actionDeleteDigestDef(key: string): Promise<Result> {
  const res = await guard(() => deleteDigestDef(key));
  revalidateDigestDefs();
  return res;
}
```

- [ ] **Step 2: Strings**

`src/lib/i18n/en.ts`:

1. In `nav`: `digest: "Weekly digest",` → `digest: "Digest archive",`, and add `digestDefs: "Digests",` after `channels: "Channels",`.
2. Replace the `digestDefs: { … }` section added in Task 6 with:

```ts
  digestDefs: {
    title: "Digests",
    sub: "What each digest is made of and how often it is written. The general one feeds the dashboard and every channel not bound to another digest.",
    hint: "A run writes every enabled digest that is due: daily ones every day, weekly ones on Monday, monthly ones on the 1st — each for the period that just closed.",
    newDef: "New digest",
    create: "Create digest",
    name: "Name",
    namePlaceholder: "AI daily",
    cadence: "Cadence",
    cadences: { daily: "daily", weekly: "weekly", monthly: "monthly" },
    itemCount: "Items",
    order: "Order",
    categories: "Categories",
    categoriesHint:
      "The sources of these categories feed it. None ticked = every category. Items the curator picked go first, then the best scored; rejected items never.",
    allCategories: "All categories",
    summary: (scope: string, items: number) => `${scope} · up to ${items} items`,
    confirmDelete: (label: string) =>
      `Delete "${label}"? Its channels go back to the general digest. The digests it already wrote stay in the archive.`,
  },
```

`src/lib/i18n/es.ts`:

1. In `nav`: `digest: "Resumen semanal",` → `digest: "Archivo",`, and add `digestDefs: "Resúmenes",` after `channels: "Canales",`.
2. Replace its `digestDefs: { … }` section with:

```ts
  digestDefs: {
    title: "Resúmenes",
    sub: "De qué está hecho cada resumen y cada cuánto se escribe. El general alimenta el panel y todo canal que no esté asociado a otro resumen.",
    hint: "Cada ejecución escribe los resúmenes activos que tocan: los diarios todos los días, los semanales los lunes, los mensuales el día 1 — cada uno sobre el período que acaba de cerrar.",
    newDef: "Nuevo resumen",
    create: "Crear resumen",
    name: "Nombre",
    namePlaceholder: "IA diaria",
    cadence: "Frecuencia",
    cadences: { daily: "diario", weekly: "semanal", monthly: "mensual" },
    itemCount: "Items",
    order: "Orden",
    categories: "Categorías",
    categoriesHint:
      "Lo alimentan las fuentes de estas categorías. Ninguna marcada = todas. Primero van los items que eligió el curador, después los mejor puntuados; los rechazados nunca.",
    allCategories: "Todas las categorías",
    summary: (scope: string, items: number) => `${scope} · hasta ${items} items`,
    confirmDelete: (label: string) =>
      `¿Eliminar «${label}»? Sus canales vuelven al resumen general. Los resúmenes que ya escribió quedan en el archivo.`,
  },
```

- [ ] **Step 3: The manager**

Create `src/components/DigestDefManager.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionDeleteDigestDef, actionSaveDigestDef } from "@/lib/actions";
import type { DigestDefInput } from "@/lib/digest-defs";
import { CADENCES } from "@/lib/periods";
import type { Category, DigestDef } from "@/lib/types";
import { useT } from "./I18nProvider";

const BLANK: DigestDefInput = {
  label: "",
  cadence: "daily",
  categories: [],
  item_count: 8,
  enabled: true,
  sort_order: 100,
};

function toInput(d: DigestDef): DigestDefInput {
  return {
    key: d.key,
    label: d.label,
    cadence: d.cadence,
    categories: d.categories,
    item_count: d.item_count,
    enabled: !!d.enabled,
    sort_order: d.sort_order,
  };
}

function Editor({
  initial,
  isNew,
  categories,
  onDone,
}: {
  initial: DigestDefInput;
  isNew: boolean;
  categories: Category[];
  onDone: () => void;
}) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useT();

  function toggle(key: string) {
    setD({
      ...d,
      categories: d.categories.includes(key) ? d.categories.filter((c) => c !== key) : [...d.categories, key],
    });
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await actionSaveDigestDef(d);
      if (!res.ok) setError(res.error ?? t.common.error);
      else {
        onDone();
        router.refresh();
      }
    });
  }

  return (
    <div className="px-5 pb-5 border-t border-line pt-4 flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
        <div>
          <span className="label">{t.digestDefs.name}</span>
          <input
            className="input"
            value={d.label}
            placeholder={t.digestDefs.namePlaceholder}
            onChange={(e) => setD({ ...d, label: e.target.value })}
          />
        </div>
        <div>
          <span className="label">{t.digestDefs.cadence}</span>
          <select
            className="select"
            value={d.cadence}
            onChange={(e) => setD({ ...d, cadence: e.target.value as DigestDefInput["cadence"] })}
          >
            {CADENCES.map((c) => (
              <option key={c} value={c}>
                {t.digestDefs.cadences[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="w-24">
          <span className="label">{t.digestDefs.itemCount}</span>
          <input
            type="number"
            min={1}
            max={30}
            className="input"
            value={d.item_count}
            onChange={(e) => setD({ ...d, item_count: Number(e.target.value) })}
          />
        </div>
        <div className="w-20">
          <span className="label">{t.digestDefs.order}</span>
          <input
            type="number"
            className="input"
            value={d.sort_order}
            onChange={(e) => setD({ ...d, sort_order: Number(e.target.value) })}
          />
        </div>
      </div>

      <div>
        <span className="label">{t.digestDefs.categories}</span>
        <div className="flex gap-1.5 flex-wrap">
          {categories.map((c) => (
            <label key={c.key} className="chip cursor-pointer !px-3 !py-1.5">
              <input
                type="checkbox"
                className="accent-[var(--accent)]"
                checked={d.categories.includes(c.key)}
                onChange={() => toggle(c.key)}
              />
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />
              {c.label}
            </label>
          ))}
        </div>
        <p className="text-[11px] text-faint mt-1">{t.digestDefs.categoriesHint}</p>
      </div>

      <label className="chip cursor-pointer !px-3 !py-2 self-start">
        <input
          type="checkbox"
          className="accent-[var(--accent)]"
          checked={d.enabled}
          onChange={(e) => setD({ ...d, enabled: e.target.checked })}
        />
        {t.common.enabled}
      </label>

      {error && (
        <p className="text-[12px]" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button className="btn btn-primary btn-sm" onClick={save} disabled={pending || !d.label.trim()}>
          {pending ? t.common.saving : isNew ? t.digestDefs.create : t.common.save}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onDone} disabled={pending}>
          {t.common.cancel}
        </button>
      </div>
    </div>
  );
}

export default function DigestDefManager({ defs, categories }: { defs: DigestDef[]; categories: Category[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useT();

  const scope = (d: DigestDef) =>
    d.categories.length
      ? d.categories.map((key) => categories.find((c) => c.key === key)?.label ?? key).join(", ")
      : t.digestDefs.allCategories;

  function remove(d: DigestDef) {
    if (!confirm(t.digestDefs.confirmDelete(d.label))) return;
    setError(null);
    start(async () => {
      const res = await actionDeleteDigestDef(d.key);
      if (!res.ok) setError(res.error ?? t.common.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <p className="text-[11.5px] text-faint leading-snug flex-1">{t.digestDefs.hint}</p>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)} disabled={creating}>
          {t.digestDefs.newDef}
        </button>
      </div>

      {error && (
        <p className="text-[12px]" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}

      {creating && (
        <section className="card overflow-hidden">
          <div className="px-5 pt-4 text-[14px] font-semibold tracking-tight">{t.digestDefs.newDef}</div>
          <Editor initial={BLANK} isNew categories={categories} onDone={() => setCreating(false)} />
        </section>
      )}

      {defs.map((d) => (
        <section key={d.key} className="card overflow-hidden">
          <div className="px-5 py-4 flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <span className="text-[14px] font-semibold tracking-tight">{d.label}</span>
                <span className="font-mono text-[11px] text-faint">{d.key}</span>
                <span className="chip !text-[10px] !py-0">{t.digestDefs.cadences[d.cadence]}</span>
                {!d.enabled && <span className="chip !text-[10px] !py-0">{t.common.disabled}</span>}
              </div>
              <p className="text-[11.5px] text-faint mt-1">{t.digestDefs.summary(scope(d), d.item_count)}</p>
            </div>
            <button className="btn btn-sm" onClick={() => setEditing((k) => (k === d.key ? null : d.key))}>
              {editing === d.key ? t.common.close : t.common.edit}
            </button>
            {d.key !== "general" && (
              <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => remove(d)}>
                {t.common.delete}
              </button>
            )}
          </div>

          {editing === d.key && (
            <Editor initial={toInput(d)} isNew={false} categories={categories} onDone={() => setEditing(null)} />
          )}
        </section>
      ))}
    </div>
  );
}
```

Phase 1 has no kind selector: every definition created here is `items`. Phase 2 adds the kind and the sources multi-select.

- [ ] **Step 4: The page and the tabs**

Create `src/app/settings/digests/page.tsx`:

```tsx
import { getCategories } from "@/lib/categories";
import { getDigestDefs } from "@/lib/digest-defs";
import { getDictionary } from "@/lib/i18n";
import PageHeader from "@/components/PageHeader";
import SettingsTabs from "@/components/SettingsTabs";
import DigestDefManager from "@/components/DigestDefManager";

export const dynamic = "force-dynamic";

export default function DigestsSettingsPage() {
  const t = getDictionary();
  return (
    <div>
      <PageHeader kicker={t.common.configuration} title={t.digestDefs.title} sub={t.digestDefs.sub} />
      <SettingsTabs />
      <div className="p-8 max-w-4xl">
        <DigestDefManager defs={getDigestDefs()} categories={getCategories()} />
      </div>
    </div>
  );
}
```

In `src/components/SettingsTabs.tsx`, add after the channels tab:

```ts
    { href: "/settings/digests", label: t.nav.digestDefs },
```

In `src/components/Nav.tsx`, in the configure group, add after the channels link:

```ts
        { href: "/settings/digests", label: t.nav.digestDefs },
```

- [ ] **Step 5: Check and try it**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all green.

By hand (copy of the database): Settings → Digests lists General (no Delete button) and the definitions migrated from category digests; create "AI daily", daily, Labs + Research, 5 items; edit, disable, re-enable; bind a channel to it under Channels; delete it — the channel is back on General; switch the UI to Spanish and read the tab.

- [ ] **Step 6: Commit**

```bash
git add src/components/DigestDefManager.tsx src/app/settings/digests/page.tsx src/lib/actions.ts src/components/SettingsTabs.tsx src/components/Nav.tsx src/lib/i18n/en.ts src/lib/i18n/es.ts
git commit -m "feat: Settings → Digests"
```

---

### Task 10: The archive by definition

**Files:**
- Modify: `src/app/digest/page.tsx` (replaced)
- Modify: `src/app/digest/[id]/page.tsx`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/es.ts`

- [ ] **Step 1: Strings**

`en.ts`, inside `digestList: { … }`: `title: "Weekly digests",` → `title: "Digests",` and delete `general: "General",`.
`es.ts`, inside `digestList: { … }`: `title: "Resúmenes semanales",` → `title: "Resúmenes",` and delete `general: "General",`.

- [ ] **Step 2: The list**

Replace `src/app/digest/page.tsx` with:

```tsx
import Link from "next/link";
import { getDb } from "@/lib/db";
import { digestDefLabel, getDigestDefs } from "@/lib/digest-defs";
import { getDictionary } from "@/lib/i18n";
import { cadenceOf, periodRange } from "@/lib/periods";
import PageHeader from "@/components/PageHeader";
import CategoryChips from "@/components/CategoryChips";

export const dynamic = "force-dynamic";

type Search = Promise<{ def?: string | string[] }>;

/** Start of a period, for sorting; an unreadable key sorts last. */
function periodStart(key: string): number {
  try {
    return periodRange(key).start.getTime();
  } catch {
    return 0;
  }
}

export default async function DigestList({ searchParams }: { searchParams: Search }) {
  // `?def=<key>` filters by definition; no param is every digest.
  const sp = await searchParams;
  const def = typeof sp.def === "string" && sp.def ? sp.def : undefined;
  const t = getDictionary();
  const db = getDb();
  const defs = getDigestDefs();
  const order = (key: string) => defs.find((d) => d.key === key)?.sort_order ?? 999;
  const digests = (
    db
      .prepare(
        `SELECT id, def_key, period_key, title, subtitle, created_at, model FROM digests
         WHERE (? IS NULL OR def_key = ?)`,
      )
      .all(def ?? null, def ?? null) as {
      id: number;
      def_key: string;
      period_key: string;
      title: string;
      subtitle: string;
      created_at: string;
      model: string;
    }[]
  ).sort((a, b) => periodStart(b.period_key) - periodStart(a.period_key) || order(a.def_key) - order(b.def_key));

  // Every enabled definition, plus any key that has digests — a disabled or
  // deleted definition's archive stays reachable.
  const written = (db.prepare("SELECT DISTINCT def_key FROM digests").all() as { def_key: string }[]).map(
    (r) => r.def_key,
  );
  const options = [
    ...defs.filter((d) => d.enabled || written.includes(d.key)),
    ...written.filter((k) => !defs.some((d) => d.key === k)).map((k) => digestDefLabel(defs, k)),
  ].map((d) => ({ key: d.key, label: d.label }));

  return (
    <div>
      <PageHeader kicker={t.digestList.kicker} title={t.digestList.title} sub={t.digestList.sub} />
      <div className="p-8 flex flex-col gap-2 max-w-3xl">
        <div className="mb-2">
          <CategoryChips
            options={options}
            active={def}
            href={(key) => (key === undefined ? "/digest" : `/digest?def=${encodeURIComponent(key)}`)}
            allLabel={t.common.all}
          />
        </div>
        {digests.length ? (
          digests.map((d) => {
            const meta = digestDefLabel(defs, d.def_key);
            const cadence = defs.some((x) => x.key === d.def_key) ? meta.cadence : (cadenceOf(d.period_key) ?? "weekly");
            return (
              <Link key={d.id} href={`/digest/${d.id}`} className="card p-5 hover:border-line-strong transition-colors">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="font-mono text-[11px] text-faint">{d.period_key}</span>
                  <span className="chip !text-[10px] !py-0">{meta.label}</span>
                  <span className="chip !text-[10px] !py-0">{t.digestDefs.cadences[cadence]}</span>
                  <span className="text-[15.5px] font-semibold tracking-tight">{d.title}</span>
                </div>
                <p className="text-[13px] text-muted mt-2 leading-relaxed">{d.subtitle}</p>
                <div className="text-[11px] text-faint mt-3 font-mono">{d.model}</div>
              </Link>
            );
          })
        ) : (
          <div className="card p-6 text-[13px] text-muted">{t.digestList.empty}</div>
        )}
      </div>
    </div>
  );
}
```

`CategoryChips` is generic (key + label); it is reused as is. The list is sorted by the start of each period because the three key shapes do not sort as strings (`2026-W43` > `2026-10-23`).

- [ ] **Step 3: The page**

In `src/app/digest/[id]/page.tsx`:

1. Replace `import { categoryLabel, getCategories } from "@/lib/categories";` with `import { digestDefLabel, getDigestDefs } from "@/lib/digest-defs";` (after the `db` import).
2. In the row type, `week_key: string;` and `category: string;` → `def_key: string;` and `period_key: string;`.
3. `const category = digest.category ? categoryLabel(getCategories(), digest.category) : null;` → `const def = digestDefLabel(getDigestDefs(), digest.def_key);`
4. Replace the `kicker={category ? … : digest.week_key}` prop with ``kicker={`${digest.period_key} · ${def.label}`}``
5. Replace the `{category && ( <Link …>{category.label}</Link> )}` block with:

```tsx
            <Link href={`/digest?def=${encodeURIComponent(def.key)}`} className="btn btn-ghost">
              {def.label}
            </Link>
```

- [ ] **Step 4: Check and try it**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
By hand (copy of the database): `/digest` shows every old digest with "General · weekly · 2026-Wnn" and the migrated category ones under their definition; the chips filter; a digest page shows `<period> · <definition>` and its button goes back to the filtered list.

- [ ] **Step 5: Commit**

```bash
git add src/app/digest/page.tsx "src/app/digest/[id]/page.tsx" src/lib/i18n/en.ts src/lib/i18n/es.ts
git commit -m "feat: digest archive by definition, with cadence and period"
```

---

### Task 11: The categories box points at Settings → Digests

**Files:**
- Modify: `src/components/CategoryManager.tsx`
- Modify: `src/lib/categories.ts`, `src/lib/types.ts`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/es.ts`
- Test: `src/lib/categories.test.ts`

`categories.digest_enabled` / `digest_items` stay in the table (the boot migration reads them once) but leave the types, the module and the UI.

- [ ] **Step 1: Tests stop passing digest fields**

In `src/lib/categories.test.ts`, remove `, digest_enabled: false, digest_items: 8`, `, digest_enabled: true, digest_items: 5` and `, digest_enabled: true, digest_items: 99` from every `saveCategory({ … })` call, and replace the two assertions that read them:

```ts
    expect(getCategory("politica-ia")).toMatchObject({ label: "Política & IA", color: "#123456" });
```

```ts
  it("keeps the key when renaming", () => {
    getCategories();
    saveCategory({ key: "labs", label: "Frontier labs", color: "#000000" });
    expect(getCategory("labs")).toMatchObject({ key: "labs", label: "Frontier labs" });
  });
```

(the second replaces the whole "keeps the key when renaming and clamps the item count" test).

- [ ] **Step 2: The module and the types**

In `src/lib/categories.ts`:

1. `CategoryInput`: delete `digest_enabled: boolean;` and `digest_items: number;`.
2. `categoryLabel`'s fallback: delete `digest_enabled: 0,` and `digest_items: 8,`.
3. `saveCategory`'s `row`: delete the `digest_enabled` and `digest_items` lines.
4. The `UPDATE` becomes:

```ts
        `UPDATE categories SET label = @label, color = @color, sort_order = @sort_order WHERE key = @key`,
```

5. The `INSERT` becomes:

```ts
    `INSERT INTO categories (key, label, color, sort_order) VALUES (@key, @label, @color, @sort_order)`,
```

In `src/lib/types.ts`, delete `digest_enabled: number;` and `digest_items: number;` from `Category`.

- [ ] **Step 3: Strings**

`en.ts`, inside `categories: { … }`, replace `hint`, delete `digest` and `digestItems`, replace `confirmDelete`, and add `digestsPointer`:

```ts
    hint: "Group your sources. A digest of its own for some categories — daily, weekly or monthly — is set up under",
    digestsPointer: "Settings → Digests.",
    name: "Name",
    namePlaceholder: "New category",
    colour: "Colour",
    order: "Order",
    create: "Create",
    confirmDelete: (label: string) =>
      `Delete "${label}"? Its sources move to General, and it is taken out of every digest — a digest left with no category is disabled.`,
  },
```

(everything after `title: "Categories",` up to and including the section's closing `},`).

`es.ts`, the same:

```ts
    hint: "Agrupá tus fuentes. Un resumen propio para algunas categorías — diario, semanal o mensual — se arma en",
    digestsPointer: "Configuración → Resúmenes.",
    name: "Nombre",
    namePlaceholder: "Nueva categoría",
    colour: "Color",
    order: "Orden",
    create: "Crear",
    confirmDelete: (label: string) =>
      `¿Eliminar «${label}»? Sus fuentes pasan a General y sale de todos los resúmenes — un resumen que se queda sin categorías se desactiva.`,
  },
```

- [ ] **Step 4: The box**

Replace `src/components/CategoryManager.tsx` with:

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { actionDeleteCategory, actionSaveCategory } from "@/lib/actions";
import type { CategoryInput } from "@/lib/categories";
import type { Category } from "@/lib/types";
import { useT } from "./I18nProvider";

const BLANK: CategoryInput = { label: "", color: "#8b93a1", sort_order: 100 };

function toInput(c: Category): CategoryInput {
  return {
    key: c.key,
    label: c.label,
    color: c.color,
    sort_order: c.sort_order,
  };
}

function Row({ initial, isNew }: { initial: CategoryInput; isNew: boolean }) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useT();
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);

  function save() {
    setError(null);
    start(async () => {
      const res = await actionSaveCategory(d);
      if (!res.ok) setError(res.error ?? t.common.error);
      else {
        if (isNew) setD(BLANK);
        router.refresh();
      }
    });
  }

  function remove() {
    if (!d.key || !confirm(t.categories.confirmDelete(d.label))) return;
    const key = d.key;
    start(async () => {
      const res = await actionDeleteCategory(key);
      if (!res.ok) setError(res.error ?? t.common.error);
      router.refresh();
    });
  }

  return (
    <div className="py-2.5 border-t border-line first:border-t-0">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="color"
          className="w-7 h-7 shrink-0 bg-transparent cursor-pointer"
          value={d.color}
          aria-label={t.categories.colour}
          onChange={(e) => setD({ ...d, color: e.target.value })}
        />
        <input
          className="input !w-44"
          value={d.label}
          placeholder={t.categories.namePlaceholder}
          aria-label={t.categories.name}
          onChange={(e) => setD({ ...d, label: e.target.value })}
        />
        {d.key && <span className="font-mono text-[11px] text-faint">{d.key}</span>}
        <label className="flex items-center gap-1.5 text-[11.5px] text-muted">
          {t.categories.order}
          <input
            type="number"
            className="input !w-16"
            value={d.sort_order}
            onChange={(e) => setD({ ...d, sort_order: Number(e.target.value) })}
          />
        </label>
        <div className="ml-auto flex gap-1.5">
          <button
            className="btn btn-primary btn-sm"
            onClick={save}
            disabled={pending || !d.label.trim() || (!isNew && !dirty)}
          >
            {isNew ? t.categories.create : t.common.save}
          </button>
          {!isNew && d.key !== "general" && (
            <button className="btn btn-ghost btn-sm" onClick={remove} disabled={pending}>
              {t.common.delete}
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="text-[12px] mt-1.5" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

export default function CategoryManager({ categories }: { categories: Category[] }) {
  const t = useT();
  return (
    <div className="card p-5">
      <h2 className="kicker mb-1">{t.categories.title}</h2>
      <p className="text-[11.5px] text-faint mb-3 leading-snug">
        {t.categories.hint}{" "}
        <Link href="/settings/digests" className="text-accent">
          {t.categories.digestsPointer}
        </Link>
      </p>
      {categories.map((c) => (
        // Keyed on the saved values, so a refresh after saving resets the row's local state.
        <Row
          key={`${c.key}:${c.label}:${c.color}:${c.sort_order}`}
          initial={toInput(c)}
          isNew={false}
        />
      ))}
      <Row initial={BLANK} isNew />
    </div>
  );
}
```

- [ ] **Step 5: Check and commit**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all green; `grep -rn "digest_enabled\|digest_items" src --include=*.ts --include=*.tsx` (bash) lists only `src/lib/db.ts` and `src/lib/db.test.ts`.

```bash
git add src/components/CategoryManager.tsx src/lib/categories.ts src/lib/categories.test.ts src/lib/types.ts src/lib/i18n/en.ts src/lib/i18n/es.ts
git commit -m "refactor: categories box points at Settings → Digests"
```

---

### Task 12: Docs, the public schedule examples, end-to-end check

**Files:**
- Modify: `docs/configuring.md`, `docs/deploying.md`, `README.md`
- Modify: `deploy/kubernetes/cronjob.yaml`, `deploy/signal-pipeline.service`, `deploy/signal-pipeline.timer`, `docker-compose.yml`

- [ ] **Step 1: docs/configuring.md**

1. Replace the paragraph "The **Pipeline** section holds two knobs: …" with:

```markdown
The **Pipeline** section holds two knobs: how many signals survive curation each
week, and how old an item can be at ingest before it is dropped. The first one
also sized the general digest when it was created; its item count lives under
**Settings → Digests** now.
```

2. In `### Categories`, replace the two bullets "**Weekly digest** turns on…" and "Deleting a category moves its sources…" with:

```markdown
- A digest of its own for one or more categories is a **digest definition**,
  under **Settings → Digests** — see [Digests](#digests) below.
- Deleting a category moves its sources to **General** and takes it out of every
  digest definition. A definition left with no category is **disabled** rather
  than silently widened to every category. General itself cannot be deleted.
```

3. Insert this section between the `---` that closes `## Sources` and `## Channels` (so it reads `---`, `## Digests …`, `---`, `## Channels`):

```markdown
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
```

4. In `## Channels`, replace the **Posts per run** and **Source digest** bullets with:

```markdown
- **Posts per run** is how many drafts the writer produces for this channel
  each time its digest is written. Set it to 0 to keep the channel for manual
  use only.
- **Source digest** is the digest definition the writer works from. The channel
  writes only in the runs where that definition is due — every day for a daily
  one, on Mondays for a weekly one, on the 1st for a monthly one — and quietly
  writes nothing on the other days. If its digest was due but skipped, the run
  log warns.
```

5. Replace everything from `## Automating the weekly run` to the line before `### Runs` with:

````markdown
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
````

6. In `### Runs`: "with\nthe same stages on the same week." → "with\nthe same stages, the same week and the same digests."

- [ ] **Step 2: The other docs and the schedule examples**

`README.md` — replace the `## Automating the weekly run` section up to its code block with:

````markdown
## Automating the runs

`GET /api/cron` runs the pipeline; `?stages=ingest,curate` runs part of it.
Protect it with `CRON_SECRET` if it is reachable from anywhere but localhost.

Schedule it once a day. Each run writes the digests that are due — daily ones
every day, weekly ones on Monday, monthly ones on the 1st, each for the period
that just closed — and the posts of the channels bound to them. `?defs=` and
`?period=` write a given digest and period instead; see
[docs/configuring.md](docs/configuring.md#what-a-run-works-on).

```bash
0 8 * * * curl -sS -H "authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron"
```
````

and in the deployment list: "systemd with a\nweekly timer." → "systemd with a\ndaily timer."; "and the weekly CronJob." → "and the daily CronJob.".

`docs/deploying.md`:

1. `Weekly runs, if you want them inside compose:` → `Daily runs, if you want them inside compose:`
2. "one `curl` a week" → "one `curl` a day".
3. Replace the crontab block and the `week=previous` paragraph after it with:

````markdown
0 8 * * * curl -sS -H "authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron"
```

Each run writes what is due that day — daily digests every day, weekly ones on
Monday, monthly ones on the 1st. See
[configuring.md](configuring.md#what-a-run-works-on).
````

(the opening ```` ```bash ```` line above it stays).

4. "a service and a weekly timer." → "a service and a daily timer."

`docker-compose.yml`, the `cron` service: the comment → `# Daily run at 08:00: it writes whatever digest is due. Start it with:  docker compose --profile cron up -d`, and the `printf` line →

```yaml
        printf '0 8 * * * curl -sS --max-time 900 -H "authorization: Bearer $$CRON_SECRET" "http://signal:3000/api/cron"\n' > /etc/crontabs/root
```

Replace `deploy/signal-pipeline.service` with:

```ini
[Unit]
Description=Signal — daily pipeline run
After=signal.service
Requires=signal.service

[Service]
Type=oneshot
EnvironmentFile=/etc/signal.env
# Ingest + curate + the digests due today + their posts. It can take several
# minutes. Daily digests are due every day, weekly ones on Monday, monthly ones
# on the 1st — each for the period that just closed.
ExecStart=/usr/bin/curl -fsS --max-time 900 \
  -H "authorization: Bearer ${CRON_SECRET}" \
  "http://127.0.0.1:${PORT}/api/cron"
SyslogIdentifier=signal-pipeline
```

Replace `deploy/signal-pipeline.timer` with:

```ini
[Unit]
Description=Signal — fires the pipeline every morning

[Timer]
# Every day at 08:00, local time of the container.
# Change the hour here, then:  systemctl daemon-reload && systemctl restart signal-pipeline.timer
OnCalendar=*-*-* 08:00:00
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
```

Replace `deploy/kubernetes/cronjob.yaml` with:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: signal-pipeline
spec:
  # Every day at 08:00, in the timezone below. Each run writes the digests that
  # are due: daily ones every day, weekly ones on Monday, monthly ones on the
  # 1st — each for the period that just closed. Keep this timezone and the
  # app's TZ (configmap.yaml) the same: the app decides what is due by its own
  # clock.
  schedule: "0 8 * * *"
  timeZone: UTC
  concurrencyPolicy: Forbid
  startingDeadlineSeconds: 3600
  successfulJobsHistoryLimit: 2
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      backoffLimit: 1
      activeDeadlineSeconds: 1200
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: pipeline
              image: curlimages/curl:8.10.1
              command: ["curl"]
              args:
                - --fail
                - --silent
                - --show-error
                - --max-time
                - "900"
                - -H
                - "Authorization: Bearer $(CRON_SECRET)"
                # No parameters: the app runs what is due today.
                - "http://signal:3000/api/cron"
              env:
                - name: CRON_SECRET
                  valueFrom:
                    secretKeyRef:
                      name: signal-secrets
                      key: CRON_SECRET
```

Check: `grep -rn "week=previous" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git . | grep -v superpowers` lists only the legacy-parameter explanations in `src/app/api/cron/route.ts` and `docs/configuring.md`; `grep -rn "which-week-gets-curated" docs README.md` prints nothing.

- [ ] **Step 3: Full verification**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all pass, build succeeds, `/settings/digests` in the route list.

Then, against a **copy** of a real database (never the live file, never the live PVC):

```bash
# The file must be called signal.db inside SIGNAL_DATA_DIR. Copy the -wal file too if there is one.
COPY=$(mktemp -d)
cp data/signal.db "$COPY/signal.db" && { cp data/signal.db-wal "$COPY/" 2>/dev/null || true; }
SIGNAL_DATA_DIR="$COPY" PORT=3999 npx next start -p 3999 &
sleep 5
curl -s "http://localhost:3999/api/cron?stages=digest,posts&defs=general&period=2026-W36"   # a past week by hand
curl -s "http://localhost:3999/api/cron?stages=digest&period=previous"                      # refused: period needs defs
curl -s "http://localhost:3999/api/cron?stages=digest,posts"                                # what is due today
kill %1
```

(`npm run build` first; without `CRON_SECRET` set, the route is open on localhost.) If `data/signal.db` does not exist locally, pull one from the cluster (`kubectl -n signal cp <pod>:/app/data/signal.db "$COPY/signal.db"` — check the mount path in `deploy/kubernetes/deployment.yaml`), or rely on the rebuild tests.

Check: the first call answers `"ok":true` and rewrites the existing W36 general digest **in place** (same id as before — the rebuild kept ids, and old posts still list under it on `/digest/<id>`); the second answers `"period" needs "defs"` with `runId: null`; the third logs either the due digests or "No digest is due in this run." and never fails for a channel whose definition is not due. Then open `/runs/<id>`: `targets.1`, `digests.1` rows read `def: … · period: …`; "Run again" replays the same definition and period. To see a Monday and a 1st, use the test suite (`now:` in `pipeline.test.ts`) — the route does not take a fake clock.

- [ ] **Step 4: Commit**

```bash
git add docs/configuring.md docs/deploying.md README.md deploy/kubernetes/cronjob.yaml deploy/signal-pipeline.service deploy/signal-pipeline.timer docker-compose.yml
git commit -m "docs: digest definitions, daily schedule and cron parameters"
```

---

## After merging

Merging does not deploy. The cluster runs `signal:local` imported into the node.

1. **Back up the `signal-data` PVC first.** The first boot of the new image runs the *second* one-way migration on the live database: the `digests` rebuild to `(def_key, period_key)` and the one-time creation of definitions from `categories.digest_enabled`. There is no down-migration; an older image cannot read the new `digests` table's key.
2. Ship:

```bash
cd /srv/projects/owns/signal && git switch main && git pull
NODE=k3s-master bash /srv/projects/owns/signal-deploy/scripts/load-local-image-k3s.sh
```

3. Open `/settings/digests` and `/digest` and check the migrated definitions and the archive before the next scheduled run.

4. **Then change the schedule in the private repo** `/srv/projects/owns/signal-deploy` (not part of this branch — do it there, as its own commit): in `base/cronjob.yaml`

   - `schedule: "0 8 * * 1"` → `schedule: "0 8 * * *"`, and update the comment above it (every day at 08:00; the app writes what is due — daily digests every day, weekly ones on Monday, monthly ones on the 1st);
   - the URL `"http://signal:3000/api/cron?week=previous"` → `"http://signal:3000/api/cron"`, and replace the comment above it ("`previous`, not the running week…") with "No parameters: the app runs what is due today.";
   - keep `timeZone: America/Argentina/Buenos_Aires`: it matches `TZ` in `base/configmap.yaml`, which is the clock the app uses to decide what is due.

   Until that change is applied, the old Monday `?week=previous` job keeps working: it writes every enabled weekly definition for the week that closed, exactly as before. Daily definitions only run once the schedule is daily.
