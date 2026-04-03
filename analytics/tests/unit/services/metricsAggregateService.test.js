/* eslint-env jest */

const {
  queryOrderSalesTotals,
  resolveUtmAggregateSource,
  queryUtmAggregatePair,
  queryProductKpiTotals,
  buildSummaryFilterOptions,
} = require("../../../services/metricsAggregateService");

describe("metricsAggregateService", () => {
  test("queryOrderSalesTotals preserves cutoff and product filter semantics", async () => {
    const conn = {
      query: jest.fn().mockResolvedValue([
        { total_orders: 8, total_sales: 320 },
      ]),
    };

    const result = await queryOrderSalesTotals(
      conn,
      "2026-03-31",
      "2026-03-31",
      { product_id: "sku-1", utm_source: "google" },
      "12:00:00",
    );

    expect(conn.query).toHaveBeenCalledTimes(1);
    expect(conn.query.mock.calls[0][0]).toContain("created_time < ?");
    expect(conn.query.mock.calls[0][1].replacements).toEqual([
      "2026-03-31",
      "2026-03-31",
      "12:00:00",
      "google",
      "sku-1",
    ]);
    expect(result).toEqual({ total_orders: 8, total_sales: 320 });
  });

  test("queryProductKpiTotals returns shared product KPI aggregates", async () => {
    const conn = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ total_orders: 5, total_sales: 250 }])
        .mockResolvedValueOnce([{ total_sessions: 100, total_atc_sessions: 25 }]),
    };

    const result = await queryProductKpiTotals({
      conn,
      start: "2026-03-01",
      end: "2026-03-10",
      filters: { product_id: "sku-1" },
    });

    expect(result).toEqual({
      total_sessions: 100,
      total_atc_sessions: 25,
      total_orders: 5,
      total_sales: 250,
    });
  });

  test("resolveUtmAggregateSource maps all supported combinations to the correct table", () => {
    expect(resolveUtmAggregateSource({ utm_source: "google" }, "daily")).toEqual({
      table: "utm_source_daily",
      filters: { utm_source: "google", utm_medium: null, utm_campaign: null },
    });
    expect(resolveUtmAggregateSource({ utm_medium: "cpc" }, "daily")).toEqual({
      table: "utm_medium_daily",
      filters: { utm_source: null, utm_medium: "cpc", utm_campaign: null },
    });
    expect(resolveUtmAggregateSource({ utm_campaign: "launch" }, "daily")).toEqual({
      table: "utm_campaign_daily",
      filters: { utm_source: null, utm_medium: null, utm_campaign: "launch" },
    });
    expect(
      resolveUtmAggregateSource({ utm_source: "google", utm_medium: "cpc" }, "daily"),
    ).toEqual({
      table: "utm_source_medium_daily",
      filters: { utm_source: "google", utm_medium: "cpc", utm_campaign: null },
    });
    expect(
      resolveUtmAggregateSource({ utm_source: "google", utm_campaign: "launch" }, "hourly"),
    ).toEqual({
      table: "utm_source_campaign_hourly",
      filters: { utm_source: "google", utm_medium: null, utm_campaign: "launch" },
    });
    expect(
      resolveUtmAggregateSource({ utm_medium: "cpc", utm_campaign: "launch" }, "hourly"),
    ).toEqual({
      table: "utm_medium_campaign_hourly",
      filters: { utm_source: null, utm_medium: "cpc", utm_campaign: "launch" },
    });
    expect(
      resolveUtmAggregateSource(
        { utm_source: "google", utm_medium: "cpc", utm_campaign: "launch" },
        "hourly",
      ),
    ).toEqual({
      table: "utm_source_medium_campaign_hourly",
      filters: { utm_source: "google", utm_medium: "cpc", utm_campaign: "launch" },
    });
    expect(
      resolveUtmAggregateSource({ utm_source: "google", utm_term: "brand" }, "daily"),
    ).toBeNull();
  });

  test("queryUtmAggregatePair batches current and previous aggregate windows", async () => {
    const conn = {
      query: jest.fn().mockResolvedValue([
        {
          current_total_orders: 9,
          current_total_sales: 450,
          current_total_sessions: 300,
          current_total_atc_sessions: 60,
          current_cancelled_orders: 2,
          current_refunded_orders: 1,
          previous_total_orders: 6,
          previous_total_sales: 240,
          previous_total_sessions: 200,
          previous_total_atc_sessions: 40,
          previous_cancelled_orders: 1,
          previous_refunded_orders: 0,
        },
      ]),
    };

    const result = await queryUtmAggregatePair(
      conn,
      { start: "2026-03-15", end: "2026-03-31" },
      { start: "2026-02-28", end: "2026-03-14" },
      { utm_source: "google", utm_medium: "cpc" },
      { granularity: "daily" },
    );

    expect(conn.query).toHaveBeenCalledTimes(1);
    expect(conn.query.mock.calls[0][0]).toContain("FROM utm_source_medium_daily");
    expect(result).toEqual({
      current: {
        total_orders: 9,
        total_sales: 450,
        total_sessions: 300,
        total_atc_sessions: 60,
        cancelled_orders: 2,
        refunded_orders: 1,
      },
      previous: {
        total_orders: 6,
        total_sales: 240,
        total_sessions: 200,
        total_atc_sessions: 40,
        cancelled_orders: 1,
        refunded_orders: 0,
      },
    });
  });

  test("buildSummaryFilterOptions preserves channel order and utm tree shape", () => {
    const result = buildSummaryFilterOptions([
      {
        order_app_name: "Facebook",
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "launch",
        utm_term: "shampoo",
        utm_content: "video",
      },
      {
        order_app_name: "Facebook",
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "launch",
        utm_term: "conditioner",
        utm_content: "banner",
      },
      {
        order_app_name: "Shop",
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        utm_term: null,
        utm_content: null,
      },
    ]);

    expect(result).toEqual({
      sales_channel: ["Facebook", "Shop"],
      utm_tree: {
        google: {
          mediums: {
            cpc: {
              campaigns: {
                launch: {
                  terms: ["shampoo", "conditioner"],
                  contents: ["video", "banner"],
                },
              },
            },
          },
        },
      },
    });
  });
});
