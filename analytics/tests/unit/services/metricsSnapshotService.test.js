/* eslint-env jest */

const {
  buildMetricsSnapshotService,
} = require("../../../services/metricsSnapshotService");

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

  test("uses completed-hour row-two cutoff semantics in dashboard summary", async () => {
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
            if (cutoffHour === 11) {
              return Promise.resolve([
                { total_sessions: 110, total_atc_sessions: 28 },
              ]);
            }
            return Promise.resolve([
              { total_sessions: 120, total_atc_sessions: 30 },
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
      value: 110,
      previous: 100,
      diff: 10,
      diff_pct: 10,
      direction: "up",
    });
    expect(response.metrics.total_atc_sessions).toEqual({
      value: 28,
      previous: 20,
      diff: 8,
      diff_pct: 40,
      direction: "up",
    });
    expect(response.metrics.conversion_rate).toEqual({
      value: 10.909090909090908,
      previous: 10,
      diff: 0.9090909090909083,
      diff_pct: 9.090909090909083,
      direction: "up",
    });
  });

  test("builds summary filter options from a single query", async () => {
    const conn = {
      query: jest.fn().mockResolvedValue([
        {
          utm_source: "google",
          utm_medium: "cpc",
          utm_campaign: "launch",
        },
      ]),
    };
    const service = buildMetricsSnapshotService();

    const result = await service.getSummaryFilterOptions({
      conn,
      start: "2026-03-01",
      end: "2026-03-31",
    });

    expect(conn.query).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      sales_channel: [],
      utm_tree: {
        google: {
          mediums: {
            cpc: {
              campaigns: {
                launch: {
                  terms: [],
                  contents: [],
                },
              },
            },
          },
        },
      },
    });
  });

  test("batches unfiltered historical current and previous dashboard summaries", async () => {
    const conn = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            current_total_orders: 100,
            current_total_sales: 1000,
            current_total_sessions: 400,
            current_total_atc_sessions: 80,
            previous_total_orders: 60,
            previous_total_sales: 600,
            previous_total_sessions: 300,
            previous_total_atc_sessions: 45,
          },
        ])
        .mockResolvedValueOnce([
          {
            current_cancelled_orders: 4,
            current_refunded_orders: 2,
            previous_cancelled_orders: 3,
            previous_refunded_orders: 1,
          },
        ]),
    };

    const service = buildMetricsSnapshotService({
      now: () => new Date("2026-03-20T06:30:00Z"),
    });
    const response = await service.getDashboardSummary({
      conn,
      brandKey: "PTS",
      start: "2026-03-10",
      end: "2026-03-15",
      compareStart: "2026-03-04",
      compareEnd: "2026-03-09",
      filters: {},
    });

    expect(conn.query).toHaveBeenCalledTimes(2);
    expect(response.metrics.total_orders).toEqual({
      value: 100,
      previous: 60,
      diff: 40,
      diff_pct: 66.66666666666666,
      direction: "up",
    });
    expect(response.metrics.total_sessions).toEqual({
      value: 400,
      previous: 300,
      diff: 100,
      diff_pct: 33.33333333333333,
      direction: "up",
    });
    expect(response.metrics.cancelled_orders).toEqual({
      value: 4,
      previous: 3,
      diff: 1,
      diff_pct: 33.33333333333333,
      direction: "up",
    });
  });

  test("uses aggregate UTM daily tables for historical dashboard summaries", async () => {
    const conn = {
      query: jest.fn().mockResolvedValue([
        {
          current_total_orders: 12,
          current_total_sales: 1200,
          current_total_sessions: 300,
          current_total_atc_sessions: 60,
          current_cancelled_orders: 3,
          current_refunded_orders: 1,
          previous_total_orders: 10,
          previous_total_sales: 800,
          previous_total_sessions: 250,
          previous_total_atc_sessions: 50,
          previous_cancelled_orders: 2,
          previous_refunded_orders: 0,
        },
      ]),
    };

    const service = buildMetricsSnapshotService({
      now: () => new Date("2026-03-20T06:30:00Z"),
    });
    const response = await service.getDashboardSummary({
      conn,
      brandKey: "PTS",
      start: "2026-03-10",
      end: "2026-03-15",
      compareStart: "2026-03-04",
      compareEnd: "2026-03-09",
      filters: { utm_source: "google", utm_medium: "cpc" },
    });

    expect(conn.query).toHaveBeenCalledTimes(1);
    expect(conn.query.mock.calls[0][0]).toContain("FROM utm_source_medium_daily");
    expect(response.metrics.total_orders).toEqual({
      value: 12,
      previous: 10,
      diff: 2,
      diff_pct: 20,
      direction: "up",
    });
    expect(response.metrics.average_order_value).toEqual({
      value: 100,
      previous: 80,
      diff: 20,
      diff_pct: 25,
      direction: "up",
    });
    expect(response.metrics.cancelled_orders).toEqual({
      value: 3,
      previous: 2,
      diff: 1,
      diff_pct: 50,
      direction: "up",
    });
  });

  test("uses completed-hour UTM hourly aggregates for all summary KPI cards", async () => {
    const conn = {
      query: jest.fn().mockImplementation((sql, options = {}) => {
        if (
          sql.includes("FROM utm_source_medium_hourly") &&
          sql.includes("current_total_orders")
        ) {
          expect(options.replacements).toContain(11);
          return Promise.resolve([
            {
              current_total_orders: 11,
              current_total_sales: 1100,
              current_total_sessions: 110,
              current_total_atc_sessions: 22,
              current_cancelled_orders: 2,
              current_refunded_orders: 0,
              previous_total_orders: 10,
              previous_total_sales: 900,
              previous_total_sessions: 100,
              previous_total_atc_sessions: 20,
              previous_cancelled_orders: 1,
              previous_refunded_orders: 0,
            },
          ]);
        }

        if (
          sql.includes("FROM utm_source_medium_hourly") &&
          !sql.includes("current_total_orders")
        ) {
          const cutoffHour = options.replacements[2];
          if (cutoffHour === 11) {
            if (options.replacements[0] === "2026-03-31") {
              return Promise.resolve([
                {
                  total_orders: 11,
                  total_sales: 1100,
                  total_sessions: 110,
                  total_atc_sessions: 22,
                  cancelled_orders: 2,
                  refunded_orders: 0,
                },
              ]);
            }
            return Promise.resolve([
              {
                total_orders: 10,
                total_sales: 900,
                total_sessions: 100,
                total_atc_sessions: 20,
                cancelled_orders: 1,
                refunded_orders: 0,
              },
            ]);
          }
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
      filters: { utm_source: "google", utm_medium: "cpc" },
    });

    expect(response.metrics.total_orders).toEqual({
      value: 11,
      previous: 10,
      diff: 1,
      diff_pct: 10,
      direction: "up",
    });
    expect(response.metrics.total_sales).toEqual({
      value: 1100,
      previous: 900,
      diff: 200,
      diff_pct: 22.22222222222222,
      direction: "up",
    });
    expect(response.metrics.average_order_value).toEqual({
      value: 100,
      previous: 90,
      diff: 10,
      diff_pct: 11.11111111111111,
      direction: "up",
    });
    expect(response.metrics.cancelled_orders).toEqual({
      value: 2,
      previous: 1,
      diff: 1,
      diff_pct: 100,
      direction: "up",
    });
    expect(response.metrics.total_sessions).toEqual({
      value: 110,
      previous: 100,
      diff: 10,
      diff_pct: 10,
      direction: "up",
    });
    expect(response.metrics.total_atc_sessions).toEqual({
      value: 22,
      previous: 20,
      diff: 2,
      diff_pct: 10,
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

  test("uses aggregate UTM hourly tables for hourly trends with comparison", async () => {
    const conn = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          { date: "2026-03-31", hour: 10, sales: 120, orders: 3, sessions: 60, atc: 12 },
          { date: "2026-03-31", hour: 11, sales: 150, orders: 4, sessions: 80, atc: 16 },
        ])
        .mockResolvedValueOnce([
          { date: "2026-03-30", hour: 10, sales: 90, orders: 2, sessions: 50, atc: 10 },
        ]),
    };

    const service = buildMetricsSnapshotService({
      now: () => new Date("2026-03-31T06:30:00Z"),
    });
    const response = await service.getTrend(
      {
        conn,
        brandKey: "PTS",
        start: "2026-03-31",
        end: "2026-03-31",
        compareStart: "2026-03-30",
        compareEnd: "2026-03-30",
        aggregate: "",
        filters: { utm_source: "google", utm_medium: "cpc", utm_campaign: "launch" },
      },
      "hourly",
    );

    expect(conn.query).toHaveBeenCalledTimes(2);
    expect(conn.query.mock.calls[0][0]).toContain("FROM utm_source_medium_campaign_hourly");
    expect(response.points[10].metrics.sales).toBe(120);
    expect(response.points[11].metrics.orders).toBe(4);
    expect(response.comparison.points[10].metrics.sessions).toBe(50);
  });

  test("keeps term/content UTM filters on the legacy raw summary path", async () => {
    const conn = {
      query: jest.fn().mockImplementation((sql) => {
        if (sql.includes("FROM shopify_orders")) {
          return Promise.resolve([{ total_orders: 5, total_sales: 250 }]);
        }
        if (sql.includes("FROM product_sessions_snapshot")) {
          return Promise.resolve([{ total_sessions: 100, total_atc_sessions: 20 }]);
        }
        if (sql.includes("FROM returns_fact")) {
          return Promise.resolve([{ cancelled_orders: 1, refunded_orders: 0 }]);
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };

    const service = buildMetricsSnapshotService({
      now: () => new Date("2026-03-20T06:30:00Z"),
    });
    await service.getDashboardSummary({
      conn,
      brandKey: "PTS",
      start: "2026-03-10",
      end: "2026-03-15",
      compareStart: "2026-03-04",
      compareEnd: "2026-03-09",
      filters: { utm_source: "google", utm_term: "brand" },
    });

    expect(
      conn.query.mock.calls.some(([sql]) => sql.includes("FROM shopify_orders")),
    ).toBe(true);
    expect(
      conn.query.mock.calls.some(([sql]) => sql.includes("FROM product_sessions_snapshot")),
    ).toBe(true);
  });
});
