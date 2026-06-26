const {
  buildOverallSnapshotService,
  SUMMARY_METRIC_KEYS,
} = require("../../../services/overallSnapshotService");

describe("overallSnapshotService", () => {
  test("scopes viewers to allowed brands and preserves unavailable brands", async () => {
    const metricsService = {
      getDashboardSummary: jest.fn(async ({ brandKey }) => ({
        prev_range: { start: "2026-06-01", end: "2026-06-07" },
        metrics: {
          total_sales: { value: brandKey === "BBB" ? 200 : 100 },
          conversion_rate: { value: 2.5 },
        },
      })),
    };
    const resolveRoute = jest.fn(async (brandKey) => {
      if (brandKey === "BBB") return { error: "routing_unavailable" };
      return {
        host: "db-host",
        port: 3306,
        user: "admin",
        password: "secret",
        dbName: brandKey,
      };
    });
    const getConnection = jest.fn((route) => ({
      sequelize: { key: route.dbName },
    }));

    const service = buildOverallSnapshotService({
      metricsService,
      resolveRoute,
      getConnection,
      getBrandsMap: () => ({ AAA: {}, BBB: {}, CCC: {} }),
    });

    const result = await service.getOverallSnapshot({
      user: {
        isAuthor: false,
        allowedBrands: ["AAA", "BBB"],
      },
      spec: {
        start: "2026-06-08",
        end: "2026-06-14",
      },
    });

    expect(resolveRoute).toHaveBeenCalledTimes(2);
    expect(metricsService.getDashboardSummary).toHaveBeenCalledTimes(1);
    expect(result.metric_keys).toEqual(SUMMARY_METRIC_KEYS);
    expect(result.brands).toEqual([
      expect.objectContaining({
        brand_key: "AAA",
        status: "ready",
      }),
      expect.objectContaining({
        brand_key: "BBB",
        status: "unavailable",
        error: "routing_unavailable",
      }),
    ]);
  });

  test("authors receive all configured brands", async () => {
    const metricsService = {
      getDashboardSummary: jest.fn(async ({ brandKey }) => ({
        prev_range: { start: "2026-05-01", end: "2026-05-31" },
        metrics: {
          total_sales: { value: brandKey === "BBB" ? 250 : 100 },
        },
      })),
    };

    const service = buildOverallSnapshotService({
      metricsService,
      resolveRoute: jest.fn(async (brandKey) => ({
        host: "db-host",
        port: 3306,
        user: "admin",
        password: "secret",
        dbName: brandKey,
      })),
      getConnection: jest.fn(() => ({
        sequelize: {},
      })),
      getBrandsMap: () => ({ BBB: {}, AAA: {} }),
    });

    const result = await service.getOverallSnapshot({
      user: {
        isAuthor: true,
      },
      spec: {
        start: "2026-06-01",
        end: "2026-06-30",
      },
    });

    expect(metricsService.getDashboardSummary).toHaveBeenCalledTimes(2);
    expect(result.brands.map((brand) => brand.brand_key)).toEqual(["AAA", "BBB"]);
    expect(result.prev_range).toEqual({ start: "2026-05-01", end: "2026-05-31" });
  });
});
