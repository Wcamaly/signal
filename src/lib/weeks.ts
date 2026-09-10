/**
 * The ISO week is the unit the whole product turns on: an item belongs to the
 * week it was published in, and the curator, the digest and the writer all work
 * on one week at a time. It lives here, away from the database, because it is a
 * calendar rule and not persistence — and because the scheduler needs to name a
 * week that is not today's.
 */

/** An ISO-8601 week, e.g. `2026-W37`. */
export type WeekKey = string;

const WEEK_KEY_RE = /^\d{4}-W\d{2}$/;

/**
 * The week an instant falls in. The local calendar date is what counts: an item
 * published on Sunday evening in Madrid belongs to that Sunday's week, not to
 * the next one because UTC had already rolled over.
 */
export function weekKey(d: Date = new Date()): WeekKey {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * The week before the one that instant falls in. Built from calendar fields
 * rather than by subtracting seven days of milliseconds, which lands on the
 * wrong date across a daylight saving change.
 */
export function previousWeekKey(d: Date = new Date()): WeekKey {
  return weekKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7));
}

export function isWeekKey(value: unknown): value is WeekKey {
  return typeof value === "string" && WEEK_KEY_RE.test(value);
}

/**
 * What a caller can ask for: the week running now, the one that just closed, or
 * a specific one. `previous` is what the weekly schedule wants — it fires on
 * Monday morning, when the current week holds a few hours of news and the week
 * worth digesting is the one that ended the night before.
 */
export type WeekSpec = "current" | "previous" | WeekKey;

export function resolveWeek(spec: string | null | undefined, now: Date = new Date()): WeekKey {
  const value = (spec ?? "").trim();
  if (!value || value === "current") return weekKey(now);
  if (value === "previous") return previousWeekKey(now);
  if (isWeekKey(value)) return value;
  throw new Error(
    `Unknown week "${value}". Use "current", "previous" or an ISO week such as ${weekKey(now)}.`,
  );
}

/** The last `count` weeks, most recent first. Feeds the week pickers. */
export function recentWeeks(count: number, now: Date = new Date()): WeekKey[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) =>
    weekKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7)),
  );
}
