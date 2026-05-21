const { buildBundlesService, normalizeBundleRequest } = require("../../../services/bundlesService");

describe("bundlesService", () => {
  test("normalizeBundleRequest accepts a valid range", () => {
    const normalized = normalizeBundleRequest({
      start: "2026-05-01",
      end: "2026-05-03",
    });

    expect(normalized.ok).toBe(true);
    expect(normalized.spec.start).toBe("2026-05-01");
    expect(normalized.spec.end).toBe("2026-05-03");
  });

  test("normalizeBundleRequest requires bundle_product_id for products", () => {
    const normalized = normalizeBundleRequest(
      { start: "2026-05-01", end: "2026-05-03" },
      { requireBundleProductId: true },
    );

    expect(normalized.ok).toBe(false);
    expect(normalized.status).toBe(400);
    expect(normalized.body.error).toBe("bundle_product_id required");
  });

  test("getBundleOptions excludes inactive bundles via query", async () => {
    const conn = { query: jest.fn().mockResolvedValue([]) };
    const service = buildBundlesService();

    await service.getBundleOptions({
      conn,
      start: "2026-05-01",
      end: "2026-05-03",
    });

    const sql = conn.query.mock.calls[0][0];
    expect(sql).toContain("bundle_daily_rollup");
    expect(sql).toContain("COALESCE(m.is_active, 0) = 1");
  });

  test("getBundleSummary maps numeric totals", async () => {
    const conn = {
      query: jest.fn().mockResolvedValue([
        {
          bundle_product_id: "123",
          bundle_name: "Starter Bundle",
          sort_order: 2,
          orders: "7",
          sales: "1495.00",
        },
      ]),
    };
    const service = buildBundlesService();

    const result = await service.getBundleSummary({
      conn,
      start: "2026-05-01",
      end: "2026-05-03",
    });

    expect(result.rows).toEqual([
      {
        bundle_product_id: "123",
        bundle_name: "Starter Bundle",
        sort_order: 2,
        orders: 7,
        sales: 1495,
      },
    ]);
  });

  test("getBundleProducts aggregates by bundle_product_id", async () => {
    const conn = { query: jest.fn().mockResolvedValue([]) };
    const service = buildBundlesService();

    await service.getBundleProducts({
      conn,
      start: "2026-05-01",
      end: "2026-05-03",
      bundleProductId: "8417496367300",
    });

    const [, options] = conn.query.mock.calls[0];
    expect(options.replacements).toEqual([
      "2026-05-01",
      "2026-05-03",
      "8417496367300",
    ]);
  });
});
