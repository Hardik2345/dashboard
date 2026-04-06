/* eslint-env jest */

const {
  buildMetricsReportService,
} = require("../../../services/metricsReportService");

describe("metricsReportService", () => {
  test("builds hourly sales compare from contiguous date-range fetches", async () => {
    const conn = {
      query: jest.fn().mockImplementation((sql, options = {}) => {
        const [start, end] = options.replacements || [];
        if (start === "2026-03-30" && end === "2026-03-31") {
          return Promise.resolve([
            { date: "2026-03-31", hour: 0, total_sales: 10 },
            { date: "2026-03-31", hour: 12, total_sales: 25 },
            { date: "2026-03-30", hour: 23, total_sales: 40 },
          ]);
        }
        if (start === "2026-03-29" && end === "2026-03-30") {
          return Promise.resolve([
            { date: "2026-03-30", hour: 0, total_sales: 7 },
            { date: "2026-03-30", hour: 12, total_sales: 15 },
            { date: "2026-03-29", hour: 23, total_sales: 20 },
          ]);
        }
        return Promise.resolve([]);
      }),
    };

    const service = buildMetricsReportService();
    const response = await service.getHourlySalesCompare({
      conn,
      days: 2,
      now: new Date("2026-03-31T06:30:00Z"),
    });

    expect(conn.query).toHaveBeenCalledTimes(2);
    expect(response.tz).toBe("IST");
    expect(response.labels).toHaveLength(37);
    expect(response.series.current[0]).toBe(10);
    expect(response.series.current[12]).toBe(25);
    expect(response.series.current[36]).toBe(40);
    expect(response.series.yesterday[0]).toBe(7);
    expect(response.series.yesterday[12]).toBe(15);
    expect(response.series.yesterday[36]).toBe(20);
  });

  test("returns payment sales split with pure filter predicates", async () => {
    const conn = {
      query: jest.fn().mockResolvedValue([
        { payment_type: "COD", sales: 90 },
        { payment_type: "Prepaid", sales: 210 },
      ]),
    };

    const service = buildMetricsReportService();
    const response = await service.getPaymentSalesSplit({
      conn,
      start: "2026-03-01",
      end: "2026-03-02",
      hourLte: 11,
      productId: "sku-1",
      filters: { utm_source: "google" },
      includeSql: true,
    });

    expect(conn.query).toHaveBeenCalledTimes(1);
    expect(response).toMatchObject({
      metric: "PAYMENT_SPLIT_SALES",
      cod_sales: 90,
      prepaid_sales: 210,
      partial_sales: 0,
      total_sales_from_split: 300,
      cod_percent: 30,
      prepaid_percent: 70,
      partial_percent: 0,
    });
    expect(response.sql_used).toContain("created_date");
  });

  test("returns order split from a single aggregate summary query when unfiltered", async () => {
    const conn = {
      query: jest.fn().mockResolvedValue([
        {
          cod_orders: 40,
          prepaid_orders: 50,
          partially_paid_orders: 10,
        },
      ]),
    };

    const service = buildMetricsReportService();
    const response = await service.getOrderSplit({
      conn,
      start: "2026-03-01",
      end: "2026-03-02",
    });

    expect(conn.query).toHaveBeenCalledTimes(1);
    expect(conn.query.mock.calls[0][0]).toContain("SUM(cod_orders)");
    expect(response).toMatchObject({
      metric: "ORDER_SPLIT",
      cod_orders: 40,
      prepaid_orders: 50,
      partially_paid_orders: 10,
      total_orders_from_split: 100,
      cod_percent: 40,
      prepaid_percent: 50,
      partially_paid_percent: 10,
    });
  });

  test("returns traffic source split with resolved previous range", async () => {
    const conn = {
      query: jest.fn().mockResolvedValue([
        { date: "2026-03-10", utm_source: "google" },
      ]),
    };

    const service = buildMetricsReportService();
    const response = await service.getTrafficSourceSplit({
      conn,
      start: "2026-03-10",
      end: "2026-03-12",
    });

    expect(response).toEqual({
      rows: [{ date: "2026-03-10", utm_source: "google" }],
      prev_range: { start: "2026-03-07", end: "2026-03-09" },
    });
  });
});
