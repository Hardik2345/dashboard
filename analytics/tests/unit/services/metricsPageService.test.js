/* eslint-env jest */

const { buildMetricsPageService } = require("../../../services/metricsPageService");

jest.mock("../../../services/duckdbQueryService", () => ({
  queryHourlyProductSessions: jest.fn(),
}));

const {
  queryHourlyProductSessions,
} = require("../../../services/duckdbQueryService");

describe("metricsPageService", () => {
  test("builds top product page payloads with resolved shop hostname", async () => {
    const conn = {
      query: jest.fn().mockResolvedValue([
        {
          landing_page_path: "/products/shampoo",
          product_id: "sku-1",
          total_sessions: 100,
          total_atc_sessions: 20,
        },
      ]),
    };
    const service = buildMetricsPageService();

    const result = await service.getTopProductPages({
      conn,
      brandKey: "TMC",
      start: "2026-03-01",
      end: "2026-03-31",
      limit: 5,
      resolveShopSubdomain: jest.fn(() => "shop-tmc"),
    });

    expect(result).toEqual({
      brand_key: "TMC",
      range: { start: "2026-03-01", end: "2026-03-31" },
      pages: [
        {
          rank: 1,
          path: "shop-tmc.myshopify.com/products/shampoo",
          product_id: "sku-1",
          sessions: 100,
          sessions_with_cart_additions: 20,
          add_to_cart_rate: 0.2,
          add_to_cart_rate_pct: 20,
        },
      ],
    });
  });

  test("delegates hourly sales summary to the cache service", async () => {
    const cacheService = {
      getHourlySalesSummary: jest.fn().mockResolvedValue({
        metric: "HOURLY_SALES_SUMMARY",
        brand: "TMC",
      }),
    };
    const service = buildMetricsPageService({ cacheService });

    const result = await service.getHourlySalesSummary({
      conn: {},
      brandKey: "TMC",
    });

    expect(cacheService.getHourlySalesSummary).toHaveBeenCalledWith({
      conn: {},
      brandKey: "TMC",
      now: expect.any(Date),
    });
    expect(result).toEqual({
      metric: "HOURLY_SALES_SUMMARY",
      brand: "TMC",
    });
  });

  test("builds product KPI payloads from shared aggregates", async () => {
    const conn = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ total_orders: 5, total_sales: 250 }])
        .mockResolvedValueOnce([{ total_sessions: 100, total_atc_sessions: 20 }]),
    };
    const service = buildMetricsPageService();

    const result = await service.getProductKpis({
      conn,
      brandKey: "TMC",
      start: "2026-03-01",
      end: "2026-03-31",
      filters: { product_id: "sku-1" },
    });

    expect(result).toEqual({
      product_id: "sku-1",
      brand_key: "TMC",
      range: { start: "2026-03-01", end: "2026-03-31" },
      sessions: 100,
      sessions_with_cart_additions: 20,
      add_to_cart_rate: 0.2,
      add_to_cart_rate_pct: 20,
      total_orders: 5,
      total_sales: 250,
      conversion_rate: 0.05,
      conversion_rate_pct: 5,
    });
  });

  test("returns product types as a flat array", async () => {
    const conn = {
      query: jest.fn().mockResolvedValue([
        { product_type: "Bundle" },
        { product_type: "Single" },
      ]),
    };
    const service = buildMetricsPageService();

    const result = await service.getProductTypes({
      conn,
      date: "2026-03-31",
    });

    expect(result).toEqual({
      date: "2026-03-31",
      types: ["Bundle", "Single"],
    });
  });

  test("builds hourly product sessions csv exports", async () => {
    queryHourlyProductSessions.mockResolvedValue([
      {
        date: "2026-03-31",
        hour: 11,
        landing_page_type: "product",
        landing_page_path: "/products/a",
        product_id: "sku-1",
        product_title: "Product A",
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "launch",
        utm_content: null,
        utm_term: null,
        referrer_name: "google",
        sessions: 12,
        sessions_with_cart_additions: 3,
      },
    ]);
    const service = buildMetricsPageService();

    const result = await service.getHourlyProductSessionsExport({
      conn: {},
      brandKey: "TMC",
      start: "2026-03-31",
      end: "2026-03-31",
      filters: { product_id: "sku-1" },
    });

    expect(queryHourlyProductSessions).toHaveBeenCalledWith({
      brandKey: "TMC",
      conn: {},
      startDate: "2026-03-31",
      endDate: "2026-03-31",
      filters: { product_id: "sku-1" },
    });
    expect(result.filename).toBe("hourly_product_sessions_TMC_2026-03-31.csv");
    expect(result.csv).toContain(
      "date,hour,landing_page_type,landing_page_path,product_id,product_title,utm_source,utm_medium,utm_campaign,utm_content,utm_term,referrer_name,sessions,sessions_with_cart_additions",
    );
    expect(result.csv).toContain(
      "2026-03-31,11,product,/products/a,sku-1,Product A,google,cpc,launch,,,google,12,3",
    );
  });
});
