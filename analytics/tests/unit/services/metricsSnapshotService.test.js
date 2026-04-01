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

  test("restores row-two today comparison semantics in dashboard summary", async () => {
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

  test("builds summary filter options from a single query", async () => {
    const conn = {
      query: jest.fn().mockResolvedValue([
        {
          order_app_name: "Facebook",
          utm_source: "google",
          utm_medium: "cpc",
          utm_campaign: "launch",
          utm_term: "shampoo",
          utm_content: "video",
        },
        {
          order_app_name: "Shop",
          utm_source: null,
          utm_medium: null,
          utm_campaign: null,
          utm_term: null,
          utm_content: null,
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
      sales_channel: ["Facebook", "Shop"],
      utm_tree: {
        google: {
          mediums: {
            cpc: {
              campaigns: {
                launch: {
                  terms: ["shampoo"],
                  contents: ["video"],
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
});
