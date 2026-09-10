import { describe, expect, it } from "vitest";
import { isWeekKey, previousWeekKey, recentWeeks, resolveWeek, weekKey } from "./weeks";

/** Local midday, so a timezone offset cannot push the date to another day. */
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);

describe("weekKey", () => {
  it("numbers the week the date falls in", () => {
    expect(weekKey(at(2026, 9, 9))).toBe("2026-W37");
  });

  it("starts the ISO week on Monday", () => {
    // 2026-09-06 is a Sunday: it closes the week the Monday before opened.
    expect(weekKey(at(2026, 9, 6))).toBe("2026-W36");
    expect(weekKey(at(2026, 9, 7))).toBe("2026-W37");
  });

  it("pads the week number to two digits", () => {
    expect(weekKey(at(2026, 1, 8))).toBe("2026-W02");
  });

  it("gives a December date the first week of the next year when ISO says so", () => {
    // 2025-12-29 is the Monday that opens ISO week 1 of 2026.
    expect(weekKey(at(2025, 12, 29))).toBe("2026-W01");
  });
});

describe("previousWeekKey", () => {
  it("goes back one week", () => {
    expect(previousWeekKey(at(2026, 9, 9))).toBe("2026-W36");
  });

  it("crosses the year boundary backwards", () => {
    expect(previousWeekKey(at(2026, 1, 1))).toBe("2025-W52");
  });

  it("is the week that closed when the schedule fires on Monday morning", () => {
    // The bug this exists for: a Monday 08:00 run must not curate the week that
    // started eight hours earlier.
    const monday = new Date(2026, 8, 7, 8, 0, 0);
    expect(weekKey(monday)).toBe("2026-W37");
    expect(previousWeekKey(monday)).toBe("2026-W36");
  });
});

describe("isWeekKey", () => {
  it.each(["2026-W01", "2026-W53"])("accepts %s", (value) => {
    expect(isWeekKey(value)).toBe(true);
  });

  it.each(["2026-w37", "2026-W7", "2026", "", null, undefined, 37])(
    "rejects %s",
    (value) => {
      expect(isWeekKey(value)).toBe(false);
    },
  );
});

describe("resolveWeek", () => {
  const now = at(2026, 9, 9);

  it("defaults to the running week when nothing is asked for", () => {
    expect(resolveWeek(undefined, now)).toBe("2026-W37");
    expect(resolveWeek(null, now)).toBe("2026-W37");
    expect(resolveWeek("", now)).toBe("2026-W37");
    expect(resolveWeek("   ", now)).toBe("2026-W37");
  });

  it("understands current and previous", () => {
    expect(resolveWeek("current", now)).toBe("2026-W37");
    expect(resolveWeek("previous", now)).toBe("2026-W36");
  });

  it("takes an explicit week through untouched", () => {
    expect(resolveWeek("2026-W12", now)).toBe("2026-W12");
    expect(resolveWeek(" 2026-W12 ", now)).toBe("2026-W12");
  });

  it("refuses anything else instead of silently curating today", () => {
    expect(() => resolveWeek("last-week", now)).toThrow(/Unknown week "last-week"/);
    expect(() => resolveWeek("2026-W7", now)).toThrow(/2026-W37/);
  });
});

describe("recentWeeks", () => {
  it("counts backwards from the given date, most recent first", () => {
    expect(recentWeeks(3, at(2026, 9, 9))).toEqual(["2026-W37", "2026-W36", "2026-W35"]);
  });

  it("returns nothing for a non-positive count", () => {
    expect(recentWeeks(0, at(2026, 9, 9))).toEqual([]);
    expect(recentWeeks(-2, at(2026, 9, 9))).toEqual([]);
  });
});
