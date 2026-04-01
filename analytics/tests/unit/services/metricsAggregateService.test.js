/* eslint-env jest */

const {
  queryOrderSalesTotals,
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
