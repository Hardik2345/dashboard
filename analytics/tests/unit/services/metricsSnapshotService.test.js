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
    expect(conn.query).toHaveBeenCalledTimes(4);
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

  test("keeps row-two main values current while using completed-hour delta semantics", async () => {
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
          sql.includes("current_total_orders")
        ) {
          return Promise.resolve([
            {
              current_total_orders: 14,
              current_total_sales: 1400,
              current_total_sessions: 120,
              current_total_atc_sessions: 30,
              previous_total_orders: 13,
              previous_total_sales: 1300,
              previous_total_sessions: 130,
              previous_total_atc_sessions: 26,
            },
          ]);
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
          if (sql.includes("SUM(ci_events)")) {
            return Promise.resolve([{ total_ci_events: 0 }]);
          }
          const cutoffHour = replacements[2];
          if (replacements[0] === "2026-03-31") {
            if (cutoffHour === 11) {
              return Promise.resolve([
                { total_sessions: 110, total_atc_sessions: 28, total_ci_events: 18 },
              ]);
            }
            return Promise.resolve([
              { total_sessions: 120, total_atc_sessions: 30, total_ci_events: 20 },
            ]);
          }
          if (cutoffHour === 11) {
            return Promise.resolve([
              { total_sessions: 100, total_atc_sessions: 20, total_ci_events: 14 },
            ]);
          }
          return Promise.resolve([
            { total_sessions: 130, total_atc_sessions: 26, total_ci_events: 16 },
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
      previous: 130,
      diff: 10,
      diff_pct: 10,
      direction: "up",
    });
    expect(response.metrics.total_atc_sessions).toEqual({
      value: 30,
      previous: 26,
      diff: 8,
      diff_pct: 40,
      direction: "up",
    });
    expect(response.metrics.conversion_rate).toEqual({
      value: 11.666666666666666,
      previous: 10,
      diff: 0.9090909090909083,
      diff_pct: 9.090909090909083,
      direction: "up",
    });
    expect(response.metrics.atc_rate.value).toBeCloseTo(25);
    expect(response.metrics.atc_rate.previous).toBeCloseTo(20);
    expect(response.metrics.atc_rate.diff).toBeCloseTo(5.4545454545);
    expect(response.metrics.atc_rate.diff_pct).toBeCloseTo(27.2727272727);
    expect(response.metrics.atc_rate.direction).toBe("up");
    expect(response.metrics.total_ci_events).toEqual({
      value: 20,
      previous: 16,
      diff: 4,
      diff_pct: 28.57142857142857,
      direction: "up",
    });
    expect(response.metrics.checkout_rate.value).toBeCloseTo(16.6666666667);
    expect(response.metrics.checkout_rate.previous).toBeCloseTo(12.3076923077);
    expect(response.metrics.checkout_rate.diff).toBeCloseTo(2.3636363636);
    expect(response.metrics.checkout_rate.diff_pct).toBeCloseTo(16.8831168831);
    expect(response.metrics.checkout_rate.direction).toBe("up");
  });

  test("builds summary filter options with discount codes", async () => {
    const conn = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            utm_source: "google",
            utm_medium: "cpc",
            utm_campaign: "launch",
          },
        ])
        .mockResolvedValueOnce([{ discount_code: "SAVE10" }]),
        .mockResolvedValueOnce([{ city: "Dubai" }, { city: "Mumbai" }]),
    };
    const service = buildMetricsSnapshotService();

    const result = await service.getSummaryFilterOptions({
      conn,
      start: "2026-03-01",
      end: "2026-03-31",
    });

    expect(conn.query).toHaveBeenCalledTimes(5);
    expect(result).toEqual({
      sales_channel: [],
      discount_codes: ["SAVE10"],
      city: ["Dubai", "Mumbai"],
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

  test("uses city summary tables for city-filtered dashboard summaries", async () => {
    const conn = {
      query: jest.fn().mockImplementation((sql, options = {}) => {
        const replacements = options.replacements || [];
        if (sql.includes("FROM daily_citywise_summary")) {
          if (sql.includes("SUM(total_orders)")) {
            if (replacements[0] === "2026-03-10") {
              return Promise.resolve([{ total_orders: 20, total_sales: 2000 }]);
            }
            return Promise.resolve([{ total_orders: 15, total_sales: 1500 }]);
          }
        }
        if (sql.includes("FROM daily_city_sessions_summary_shopify")) {
          if (replacements[0] === "2026-03-10") {
            return Promise.resolve([{ total_sessions: 400, total_atc_sessions: 80 }]);
          }
          return Promise.resolve([{ total_sessions: 300, total_atc_sessions: 45 }]);
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
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
      filters: { city: ["Dubai", "Mumbai"] },
    });

    expect(response.metrics.total_orders.value).toBe(20);
    expect(response.metrics.total_sales.value).toBe(2000);
    expect(response.metrics.total_sessions.value).toBe(400);
    expect(response.metrics.total_atc_sessions.value).toBe(80);
    expect(response.metrics.total_ci_events.unavailable).toBe(true);
    expect(response.metrics.checkout_rate.unavailable).toBe(true);
    expect(response.metrics.cancelled_orders.unavailable).toBe(true);
    expect(response.metrics.refunded_orders.unavailable).toBe(true);
    expect(conn.query.mock.calls.some(([sql]) => sql.includes("FROM daily_citywise_summary"))).toBe(true);
    expect(
      conn.query.mock.calls.some(([sql]) =>
        sql.includes("FROM daily_city_sessions_summary_shopify"),
      ),
    ).toBe(true);
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

    expect(conn.query).toHaveBeenCalledTimes(3);
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

  test("uses UTM daily aggregates for main values and hourly aggregates for deltas", async () => {
    const conn = {
      query: jest.fn().mockImplementation((sql, options = {}) => {
        if (
          sql.includes("FROM utm_source_medium_daily") &&
          sql.includes("current_total_orders")
        ) {
          return Promise.resolve([
            {
              current_total_orders: 15,
              current_total_sales: 1500,
              current_total_sessions: 150,
              current_total_atc_sessions: 30,
              current_cancelled_orders: 3,
              current_refunded_orders: 0,
              previous_total_orders: 12,
              previous_total_sales: 960,
              previous_total_sessions: 120,
              previous_total_atc_sessions: 24,
              previous_cancelled_orders: 2,
              previous_refunded_orders: 0,
            },
          ]);
        }

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

        if (sql.includes("SUM(ci_events)")) {
          const cutoffHour = options.replacements?.[2];
          if (options.replacements?.[0] === "2026-03-31") {
            return Promise.resolve([
              { total_ci_events: cutoffHour === 11 ? 18 : 20 },
            ]);
          }
          return Promise.resolve([
            { total_ci_events: cutoffHour === 11 ? 16 : 17 },
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
      filters: { utm_source: "google", utm_medium: "cpc" },
    });

    expect(response.metrics.total_orders).toEqual({
      value: 15,
      previous: 12,
      diff: 1,
      diff_pct: 10,
      direction: "up",
    });
    expect(response.metrics.total_sales).toEqual({
      value: 1500,
      previous: 960,
      diff: 200,
      diff_pct: 22.22222222222222,
      direction: "up",
    });
    expect(response.metrics.average_order_value).toEqual({
      value: 100,
      previous: 80,
      diff: 10,
      diff_pct: 11.11111111111111,
      direction: "up",
    });
    expect(response.metrics.cancelled_orders).toEqual({
      value: 3,
      previous: 2,
      diff: 1,
      diff_pct: 100,
      direction: "up",
    });
    expect(response.metrics.total_sessions).toEqual({
      value: 150,
      previous: 120,
      diff: 10,
      diff_pct: 10,
      direction: "up",
    });
    expect(response.metrics.total_atc_sessions).toEqual({
      value: 30,
      previous: 24,
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
    expect(response.metrics.atc_rate).toEqual({
      value: 20,
      previous: 20,
      diff: 0,
      diff_pct: 0,
      direction: "flat",
    });
    expect(response.metrics.checkout_rate).toEqual({
      value: 17,
      previous: 17,
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

  test("uses discount daily aggregates for summary and marks unsupported KPIs unavailable", async () => {
    const conn = {
      query: jest.fn().mockResolvedValue([
        {
          current_total_orders: 12,
          current_total_sales: 1200,
          previous_total_orders: 10,
          previous_total_sales: 900,
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
      filters: { discount_code: "SAVE10" },
    });

    expect(conn.query).toHaveBeenCalledTimes(3);
    expect(conn.query.mock.calls[0][0]).toContain("FROM dashboard_discount_daily");
    expect(response.metrics.total_orders.value).toBe(12);
    expect(response.metrics.total_sales.value).toBe(1200);
    expect(response.metrics.average_order_value.value).toBe(100);
    expect(response.metrics.total_sessions).toMatchObject({
      value: null,
      unavailable: true,
    });
    expect(response.metrics.conversion_rate).toMatchObject({
      value: null,
      unavailable: true,
    });
  });

  test("uses discount hourly aggregates for today summary deltas", async () => {
    const conn = {
      query: jest.fn().mockImplementation((sql, options = {}) => {
        if (sql.includes("FROM dashboard_discount_daily")) {
          return Promise.resolve([
            {
              current_total_orders: 15,
              current_total_sales: 1500,
              previous_total_orders: 12,
              previous_total_sales: 960,
            },
          ]);
        }
        if (sql.includes("FROM dashboard_discount_hourly")) {
          expect(options.replacements).toContain(11);
          return Promise.resolve([
            {
              current_total_orders: 11,
              current_total_sales: 1100,
              previous_total_orders: 10,
              previous_total_sales: 900,
            },
          ]);
        }
        if (sql.includes("SUM(ci_events)")) {
          return Promise.resolve([{ total_ci_events: 0 }]);
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
      filters: { discount_code: "SAVE10" },
    });

    expect(conn.query.mock.calls[0][0]).toContain("FROM dashboard_discount_daily");
    expect(conn.query.mock.calls[1][0]).toContain("FROM dashboard_discount_hourly");
    expect(response.metrics.total_orders).toMatchObject({
      value: 15,
      previous: 12,
      diff: 1,
      diff_pct: 10,
    });
    expect(response.metrics.average_order_value.diff_pct).toBeCloseTo(11.111111);
  });

  test("uses discount hourly aggregate table for hourly trends", async () => {
    const conn = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          { date: "2026-03-31", hour: 10, sales: 120, orders: 3, sessions: 0, atc: 0 },
        ])
        .mockResolvedValueOnce([]),
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
        filters: { discount_code: "SAVE10" },
      },
      "hourly",
    );

    expect(conn.query).toHaveBeenCalledTimes(2);
    expect(conn.query.mock.calls[0][0]).toContain("FROM dashboard_discount_hourly");
    expect(response.points[10].metrics.sales).toBe(120);
    expect(response.points[10].metrics.orders).toBe(3);
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
        if (sql.includes("SUM(ci_events)")) {
          return Promise.resolve([{ total_ci_events: 0 }]);
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
