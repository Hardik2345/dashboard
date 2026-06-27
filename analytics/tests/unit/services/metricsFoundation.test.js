/* eslint-env jest */

const {
  formatUtcDate,
  getNowIst,
  getTodayIst,
  getTodayInTimezone,
  getTimezoneContext,
  normalizeTimezone,
  isTodayUtc,
  secondsToTime,
  parseHourFromCutoff,
  resolveCompareRange,
  buildLiveCutoffContext,
  buildCompletedHourCutoffContext,
  buildRowTwoComparisonCutoffs,
} = require("../../../services/metricsFoundation");

describe("metricsFoundation", () => {
  test("formats shared UTC/IST date helpers consistently", () => {
    const now = new Date("2026-03-31T06:30:15Z");

    expect(formatUtcDate(now)).toBe("2026-03-31");
    expect(getNowIst(now).toISOString()).toBe("2026-03-31T12:00:15.000Z");
    expect(getTodayIst(now)).toBe("2026-03-31");
    expect(getTodayInTimezone("Asia/Riyadh", now)).toBe("2026-03-31");
    expect(getTimezoneContext(now, "America/New_York")).toMatchObject({
      timezone: "America/New_York",
      today: "2026-03-31",
      currentHour: 2,
      currentMinute: 30,
      currentSecond: 15,
    });
    expect(normalizeTimezone("bad-zone")).toBe("Asia/Kolkata");
    expect(isTodayUtc("2026-03-31", now)).toBe(true);
    expect(secondsToTime(43215)).toBe("12:00:15");
    expect(parseHourFromCutoff("12:34:56")).toBe(12);
  });

  test("builds live and completed-hour cutoff contexts with row-two comparison cutoffs", () => {
    const now = new Date("2026-03-31T06:30:15Z");

    const live = buildLiveCutoffContext("2026-03-31", "2026-03-31", now, "Asia/Kolkata");
    const completed = buildCompletedHourCutoffContext(
      "2026-03-31",
      "2026-03-31",
      now,
      "Asia/Kolkata",
    );

    expect(live).toMatchObject({
      includesToday: true,
      cutoffHour: 12,
      cutoffTime: "12:00:15",
      todayIst: "2026-03-31",
    });
    expect(completed).toMatchObject({
      currentRangeIncludesToday: true,
      cutoffHour: 11,
      orderCutoffTime: "12:00:15",
      todayIst: "2026-03-31",
    });
    expect(buildRowTwoComparisonCutoffs(live)).toEqual({
      currentCutoffHour: 12,
      previousSessionCutoffHour: 12,
      currentOrderCutoffTime: "13:00:00",
      previousOrderCutoffTime: "13:00:00",
    });
  });

  test("detects today across UTC day boundaries in store timezone", () => {
    const now = new Date("2026-04-01T02:30:00Z");
    const live = buildLiveCutoffContext("2026-03-31", "2026-03-31", now, "America/New_York");
    const completed = buildCompletedHourCutoffContext(
      "2026-03-31",
      "2026-03-31",
      now,
      "America/New_York",
    );

    expect(live).toMatchObject({
      includesToday: true,
      cutoffHour: 22,
      today: "2026-03-31",
      timezone: "America/New_York",
    });
    expect(completed).toMatchObject({
      currentRangeIncludesToday: true,
      cutoffHour: 21,
      orderCutoffTime: "22:30:00",
    });
  });

  test("resolves explicit and implicit compare ranges", () => {
    expect(
      resolveCompareRange("2026-03-10", "2026-03-12", "2026-03-01", "2026-03-03"),
    ).toEqual({
      start: "2026-03-01",
      end: "2026-03-03",
    });
    expect(resolveCompareRange("2026-03-10", "2026-03-12", null, null)).toEqual({
      start: "2026-03-07",
      end: "2026-03-09",
    });
  });
});
