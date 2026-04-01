/* eslint-env jest */

const {
  buildMetricsSnapshotService,
} = require("../../../services/metricsSnapshotService");

function buildDailyRows(startDate, days, rowFactory) {
  const rows = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  for (let index = 0; index < days; index += 1) {
    const date = new Date(start.getTime() + index * 24 * 3600_000)
      .toISOString()
      .slice(0, 10);
    rows.push(rowFactory(date, index));
  }
  return rows;
}

describe("metricsSnapshotService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("uses batched cache path for single-day dashboard summaries", async () => {
    jest
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2026-03-31T06:30:00Z").getTime());

    const conn = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ cancelled_orders: 1, refunded_orders: 2 }])
        .mockResolvedValueOnce([{ cancelled_orders: 0, refunded_orders: 1 }]),
    };
    const fetchCachedMetricsBatch = jest.fn().mockResolvedValue([
      {
        total_orders: 20,
        total_sales: 500,
        total_sessions: 100,
        total_atc_sessions: 30,
        average_order_value: 25,
        conversion_rate: 20,
      },
      {
        total_orders: 10,
        total_sales: 200,
        total_sessions: 80,
        total_atc_sessions: 15,
        average_order_value: 20,
        conversion_rate: 12.5,
      },
    ]);

    const service = buildMetricsSnapshotService({ fetchCachedMetricsBatch });
    const response = await service.getDashboardSummary({
      conn,
      brandKey: "PTS",
      start: "2026-03-30",
      end: "2026-03-30",
      compareStart: null,
      compareEnd: null,
      filters: {},
    });

    expect(fetchCachedMetricsBatch).toHaveBeenCalledWith("PTS", [
      "2026-03-30",
      "2026-03-29",
    ]);
    expect(conn.query).toHaveBeenCalledTimes(2);
    expect(response.metrics.total_sales).toEqual({
      value: 500,
      previous: 200,
      diff: 300,
      diff_pct: 150,
      direction: "up",
    });
    expect(response.sources).toEqual({
      current: "cache+db_returns",
      previous: "cache+db_returns",
      hourly_cutoff: null,
    });
  });

  test("builds rolling 30 day series from constant daily queries", async () => {
    const conn = {
      query: jest
        .fn()
        .mockResolvedValueOnce(
          buildDailyRows("2026-02-01", 59, (date, index) => ({
            date,
            sales: 100 + index,
            orders: 10 + (index % 3),
          })),
        )
        .mockResolvedValueOnce(
          buildDailyRows("2026-02-01", 59, (date, index) => ({
            date,
            sessions: 200 + index,
            atc: 50 + (index % 5),
          })),
        ),
    };

    const service = buildMetricsSnapshotService();
    const response = await service.getRolling30d({
      conn,
      brandKey: "PTS",
      end: "2026-03-30",
      filters: {},
    });

    expect(conn.query).toHaveBeenCalledTimes(2);
    expect(response.metric).toBe("ROLLING_30D_SERIES");
    expect(response.days).toHaveLength(30);
    expect(response.days[0].window_start).toBe("2026-01-31");
    expect(response.days[29].window_end).toBe("2026-03-30");
  });

  test("uses actual hourly product sessions without distributing daily totals", async () => {
    jest
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2026-03-31T06:30:00Z").getTime());

    const conn = {
      query: jest.fn().mockImplementation((sql) => {
        if (sql.includes("FROM hourly_product_sessions")) {
          return Promise.resolve([
            { date: "2026-03-30", hour: 10, sessions: 24, atc: 6 },
          ]);
        }
        if (sql.includes("FROM shopify_orders")) {
          return Promise.resolve([
            { date: "2026-03-30", hour: 10, sales: 120, orders: 3 },
          ]);
        }
        return Promise.resolve([]);
      }),
    };

    const service = buildMetricsSnapshotService();
    const response = await service.getTrend(
      {
        conn,
        brandKey: "PTS",
        start: "2026-03-30",
        end: "2026-03-30",
        compareStart: null,
        compareEnd: null,
        aggregate: "",
        filters: { product_id: "sku-1" },
      },
      "hourly",
    );

    expect(response.points).toHaveLength(24);
    expect(response.points[10].metrics.sessions).toBe(24);
    expect(response.points[10].metrics.atc).toBe(6);
    expect(response.points[9].metrics.sessions).toBe(0);
    expect(response.points[11].metrics.sessions).toBe(0);
  });

  test("restores legacy row-two today comparison semantics in dashboard summary", async () => {
    const conn = {
      query: jest.fn().mockImplementation((sql, options = {}) => {
        const replacements = options.replacements || [];

        if (sql.includes("FROM returns_fact")) {
          return Promise.resolve([
            { cancelled_orders: 0, refunded_orders: 0 },
          ]);
        }

        if (sql.includes("FROM shopify_orders")) {
          if (replacements[0] === "2026-03-31") {
            return Promise.resolve([{ total_orders: 12, total_sales: 1200 }]);
          }
          return Promise.resolve([{ total_orders: 10, total_sales: 900 }]);
        }

        if (
          sql.includes("FROM overall_summary") &&
          sql.includes("SUM(COALESCE(adjusted_total_sessions, total_sessions))")
        ) {
          if (replacements[0] === "2026-03-31") {
            return Promise.resolve([
              {
                total_orders: 0,
                total_sales: 0,
                total_sessions: 120,
                total_atc_sessions: 30,
              },
            ]);
          }
          return Promise.resolve([
            {
              total_orders: 0,
              total_sales: 0,
              total_sessions: 95,
              total_atc_sessions: 19,
            },
          ]);
        }

        if (sql.includes("FROM hourly_sessions_summary_shopify")) {
          const cutoffHour = replacements[2];
          if (replacements[0] === "2026-03-31") {
            return Promise.resolve([
              { total_sessions: 110, total_atc_sessions: 28 },
            ]);
          }
          if (cutoffHour === 11) {
            return Promise.resolve([
              { total_sessions: 100, total_atc_sessions: 20 },
            ]);
          }
          return Promise.resolve([
            { total_sessions: 130, total_atc_sessions: 26 },
          ]);
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };

    const service = buildMetricsSnapshotService({
      now: () => new Date("2026-03-31T06:30:00Z"),
    });
    const response = await service.getDashboardSummary({
      conn,
      brandKey: "PTS",
      start: "2026-03-31",
      end: "2026-03-31",
      compareStart: null,
      compareEnd: null,
      filters: {},
    });

    expect(response.metrics.total_sessions).toEqual({
      value: 120,
      previous: 100,
      diff: 20,
      diff_pct: 20,
      direction: "up",
    });
    expect(response.metrics.total_atc_sessions).toEqual({
      value: 30,
      previous: 20,
      diff: 10,
      diff_pct: 50,
      direction: "up",
    });
    expect(response.metrics.conversion_rate).toEqual({
      value: 10,
      previous: 10,
      diff: 0,
      diff_pct: 0,
      direction: "flat",
    });
  });

  test("exposes total orders delta through the canonical snapshot service", async () => {
    const service = buildMetricsSnapshotService({
      deltaForSumImpl: jest.fn().mockResolvedValue({
        current: 12,
        previous: 10,
        diff_pct: 20,
        direction: "up",
      }),
    });

    const result = await service.getTotalOrdersDelta({
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

  test("preserves filtered total sessions delta semantics through snapshot service", async () => {
    const computeTotalSessionsImpl = jest
      .fn()
      .mockResolvedValueOnce(90)
      .mockResolvedValueOnce(60);
    const service = buildMetricsSnapshotService({
      hasUtmFiltersImpl: jest.fn(() => true),
      computeTotalSessionsImpl,
      previousWindowImpl: jest.fn(() => ({
        prevStart: "2026-03-29",
        prevEnd: "2026-03-30",
      })),
    });

    const result = await service.getTotalSessionsDelta({
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

  test("preserves legacy hourly CVR comparison semantics through snapshot service", async () => {
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
    const service = buildMetricsSnapshotService({
      now: () => new Date("2026-03-31T06:30:00Z"),
      prevDayStrImpl: jest.fn(() => "2026-03-30"),
    });

    const result = await service.getCvrDelta({
      start: "2026-03-31",
      align: "hour",
      conn,
      filters: {},
    });

    expect(conn.query.mock.calls[1][1].replacements).toEqual(["2026-03-30", 11]);
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
