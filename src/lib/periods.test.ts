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
