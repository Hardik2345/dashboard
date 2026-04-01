/* eslint-env jest */

const { buildMetricsPageService } = require("../../../services/metricsPageService");

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
});
