/* eslint-env jest */

const {
  buildProductConversionService,
} = require("../../../services/productConversionService");

describe("productConversionService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test("returns paginated rows with compare data and product-type parity", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-03-31T06:30:00Z"));

    const conn = {
      query: jest.fn().mockImplementation((sql) => {
        if (sql.includes("COUNT(*) AS total_count")) {
          return Promise.resolve([{ total_count: 1 }]);
        }
        if (
          sql.includes("FROM product_landing_mapping m") &&
          sql.includes("LIMIT 5 OFFSET 0")
        ) {
          return Promise.resolve([
            {
              product_id: "sku-1",
              landing_page_path: "/products/a",
              sessions: 100,
              atc: 25,
              atc_rate: 25,
              orders: 8,
              sales: 640,
              cvr: 8,
              prev_sessions: 80,
              prev_atc: 16,
              prev_atc_rate: 20,
              prev_orders: 6,
              prev_sales: 480,
              prev_cvr: 7.5,
            },
          ]);
        }
        return Promise.resolve([]);
      }),
    };

    const service = buildProductConversionService();
    const normalized = service.normalizeProductConversionRequest({
      start: "2026-03-31",
      end: "2026-03-31",
      page: "1",
      page_size: "5",
      sort_by: "sales",
      sort_dir: "asc",
      compare_start: "2026-03-30",
      compare_end: "2026-03-30",
      search: "/products",
      product_types: JSON.stringify(["Bundle"]),
      page_types: JSON.stringify(["Product"]),
      filters: JSON.stringify([{ field: "sales", operator: "gt", value: 100 }]),
    });

    expect(normalized.ok).toBe(true);
    const response = await service.getProductConversion({
      ...normalized.spec,
      conn,
    });

    expect(conn.query.mock.calls[0][0]).toContain("FROM product_landing_mapping m");
    expect(conn.query.mock.calls[0][0]).toContain("m.product_type IN (?)");
    expect(conn.query).toHaveBeenCalledTimes(2);
    expect(response.total_count).toBe(1);
    expect(response.rows[0]).toEqual({
      product_id: "sku-1",
      landing_page_path: "/products/a",
      sessions: 100,
      atc: 25,
      atc_rate: 25,
      orders: 8,
      sales: 640,
      cvr: 8,
      previous: {
        sessions: 80,
        atc: 16,
        atc_rate: 20,
        orders: 6,
        sales: 480,
        cvr: 7.5,
      },
    });
  });

  test("builds csv output with compare columns and visible-column parity", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-03-31T06:30:00Z"));

    const conn = {
      query: jest.fn().mockImplementation((sql) => {
        if (sql.includes("FROM sessions_60d s") && sql.includes("ORDER BY sessions DESC")) {
          return Promise.resolve([
            {
              product_id: "sku-1",
              landing_page_path: "/products/a",
              sessions: 100,
              atc: 25,
              atc_rate: 25,
              orders: 8,
              sales: 640,
              cvr: 8,
              prev_sessions: 80,
              prev_atc: 16,
              prev_atc_rate: 20,
              prev_orders: 6,
              prev_sales: 480,
              prev_cvr: 7.5,
            },
          ]);
        }
        return Promise.resolve([]);
      }),
    };

    const service = buildProductConversionService();
    const normalized = service.normalizeProductConversionRequest({
      start: "2026-03-31",
      end: "2026-03-31",
      compare_start: "2026-03-30",
      compare_end: "2026-03-30",
      visible_columns: JSON.stringify(["sessions", "cvr"]),
    });

    const response = await service.getProductConversionCsv({
      ...normalized.spec,
      conn,
    });

    expect(response.filename).toBe("product_conversion_2026-03-31.csv");
    expect(conn.query).toHaveBeenCalledTimes(1);
    expect(response.headers).toEqual([
      "landing_page_path",
      "sessions",
      "cvr",
      "prev_sessions",
      "prev_cvr",
    ]);
    expect(response.csv).toContain(
      "landing_page_path,sessions,cvr,prev_sessions,prev_cvr",
    );
    expect(response.csv).toContain("/products/a,100,8,80,7.5");
  });
});
