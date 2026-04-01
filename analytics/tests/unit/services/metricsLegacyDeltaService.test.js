/* eslint-env jest */

const {
  buildMetricsLegacyDeltaService,
  isTodayUtc,
  getIstContext,
  secondsToTime,
} = require("../../../services/metricsLegacyDeltaService");

describe("metricsLegacyDeltaService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("exposes stable UTC/IST time helpers", () => {
    const now = new Date("2026-03-31T06:30:15Z");

    expect(isTodayUtc("2026-03-31", now)).toBe(true);
    expect(isTodayUtc("2026-03-30", now)).toBe(false);
    expect(getIstContext(now)).toMatchObject({
      todayIst: "2026-03-31",
      secondsNow: 43215,
    });
    expect(secondsToTime(43215)).toBe("12:00:15");
  });

  test("calcTotalOrdersDelta preserves the day-level delta shape", async () => {
    const service = buildMetricsLegacyDeltaService({
      deltaForSumImpl: jest.fn().mockResolvedValue({
        current: 12,
        previous: 10,
        diff_pct: 20,
        direction: "up",
      }),
    });

    const result = await service.calcTotalOrdersDelta({
      start: "2026-03-31",
      conn: {},
    });

    expect(result).toEqual({
      metric: "TOTAL_ORDERS_DELTA",
      date: "2026-03-31",
      current: 12,
      previous: 10,
      diff_pct: 20,
      direction: "up",
    });
  });

  test("calcTotalSalesDelta uses prev-range-avg semantics for ranged compare", async () => {
    const avgForRangeImpl = jest
      .fn()
      .mockResolvedValueOnce(150)
      .mockResolvedValueOnce(100);
    const service = buildMetricsLegacyDeltaService({
      avgForRangeImpl,
      previousWindowImpl: jest.fn(() => ({
        prevStart: "2026-03-29",
        prevEnd: "2026-03-30",
      })),
    });

    const result = await service.calcTotalSalesDelta({
      start: "2026-03-31",
      end: "2026-04-01",
      compare: "prev-range-avg",
      conn: {},
    });

    expect(result).toEqual({
      metric: "TOTAL_SALES_DELTA",
      range: { start: "2026-03-31", end: "2026-04-01" },
      current: 150,
      previous: 100,
      diff_pct: 50,
      direction: "up",
      compare: "prev-range-avg",
    });
  });

  test("calcTotalSessionsDelta preserves filtered range semantics", async () => {
    const computeTotalSessionsImpl = jest
      .fn()
      .mockResolvedValueOnce(90)
      .mockResolvedValueOnce(60);
    const service = buildMetricsLegacyDeltaService({
      hasUtmFiltersImpl: jest.fn(() => true),
      computeTotalSessionsImpl,
      previousWindowImpl: jest.fn(() => ({
        prevStart: "2026-03-29",
        prevEnd: "2026-03-30",
      })),
    });

    const result = await service.calcTotalSessionsDelta({
      start: "2026-03-31",
      end: "2026-04-01",
      conn: {},
      filters: { utm_source: "google" },
    });

    expect(result).toEqual({
      metric: "TOTAL_SESSIONS_DELTA",
      range: { start: "2026-03-31", end: "2026-04-01" },
      current: 90,
      previous: 60,
      diff_pct: 50,
      direction: "up",
    });
  });

  test("calcAtcSessionsDelta preserves today hourly comparison behavior", async () => {
    const conn = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ total: 12 }])
        .mockResolvedValueOnce([{ total: 9 }])
        .mockResolvedValueOnce([{ total: 18 }]),
    };
    const service = buildMetricsLegacyDeltaService({
      now: () => new Date("2026-03-31T06:30:00Z"),
      prevDayStrImpl: jest.fn(() => "2026-03-30"),
    });

    const result = await service.calcAtcSessionsDelta({
      start: "2026-03-31",
      conn,
      align: "hour",
    });

    expect(conn.query.mock.calls[1][1].replacements).toEqual(["2026-03-30", 11]);
    expect(result).toEqual({
      metric: "ATC_SESSIONS_DELTA",
      date: "2026-03-31",
      current: 18,
      previous: 9,
      diff_pct: 100,
      direction: "up",
      align: "hour",
      hour: 12,
    });
  });

  test("calcAovDelta preserves hourly debug payloads", async () => {
    const conn = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ total: 300 }])
        .mockResolvedValueOnce([{ total: 200 }])
        .mockResolvedValueOnce([{ cnt: 6 }])
        .mockResolvedValueOnce([{ cnt: 4 }]),
    };
    const service = buildMetricsLegacyDeltaService({
      now: () => new Date("2026-03-31T06:30:00Z"),
      previousWindowImpl: jest.fn(() => ({
        prevStart: "2026-03-29",
        prevEnd: "2026-03-30",
      })),
      log: { debug: jest.fn() },
    });

    const result = await service.calcAovDelta({
      start: "2026-03-31",
      end: "2026-03-31",
      align: "hour",
      debug: true,
      conn,
      filters: {},
    });

    expect(result).toMatchObject({
      metric: "AOV_DELTA",
      current: 50,
      previous: 50,
      diff_pct: 0,
      direction: "flat",
      align: "hour",
      hour: 12,
      cutoff_time: "12:00:00",
      sales: { current: 300, previous: 200 },
      orders: { current: 6, previous: 4 },
    });
  });

  test("calcCvrDelta preserves last-completed-hour comparison semantics", async () => {
    const conn = {
      query: jest.fn().mockImplementation((sql, options = {}) => {
        const replacements = options.replacements || [];
        if (sql.includes("hourly_sessions_summary_shopify")) {
          if (replacements[0] === "2026-03-31") {
            return Promise.resolve([{ total: 120 }]);
          }
          return Promise.resolve([{ total: 100 }]);
        }
        if (sql.includes("overall_summary")) {
          return Promise.resolve([{ total: 140 }]);
        }
        if (sql.includes("shopify_orders")) {
          if (replacements[0] === "2026-03-31") {
            return Promise.resolve([{ cnt: 14 }]);
          }
          return Promise.resolve([{ cnt: 10 }]);
        }
        throw new Error(`Unexpected SQL ${sql}`);
      }),
    };
    const service = buildMetricsLegacyDeltaService({
      now: () => new Date("2026-03-31T06:30:00Z"),
      prevDayStrImpl: jest.fn(() => "2026-03-30"),
    });

    const result = await service.calcCvrDelta({
      start: "2026-03-31",
      align: "hour",
      conn,
      filters: {},
    });

    expect(conn.query.mock.calls[1][1].replacements).toEqual(["2026-03-30", 11]);
    expect(conn.query.mock.calls[3][1].replacements).toEqual([
      "2026-03-30",
      "2026-03-30",
      "12:00:00",
    ]);
    expect(result).toMatchObject({
      metric: "CVR_DELTA",
      date: "2026-03-31",
      current: {
        total_orders: 14,
        total_sessions: 140,
        cvr_percent: 10,
      },
      previous: {
        total_orders: 10,
        total_sessions: 100,
        cvr_percent: 10,
      },
      diff_pp: 0,
      diff_pct: 0,
      direction: "flat",
      align: "hour",
      hour: 12,
      cutoff_time: "12:00:00",
    });
  });
});
