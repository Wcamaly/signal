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
