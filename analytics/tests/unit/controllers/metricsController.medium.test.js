/* eslint-env jest */

const mockReportService = {
  getTrafficSourceSplit: jest.fn(),
  getPaymentSalesSplit: jest.fn(),
  getOrderSplit: jest.fn(),
  getHourlySalesCompare: jest.fn(),
};

const mockParseHourLte = jest.fn((raw) => ({
  hasHourLte:
    raw !== undefined && raw !== null && `${raw}`.trim() !== "",
  hourLte:
    raw !== undefined && raw !== null && `${raw}`.trim() !== ""
      ? Number(raw)
      : null,
}));

const mockMetricsService = {
  getTrend: jest.fn(),
  getDashboardSummary: jest.fn(),
  getSummaryFilterOptions: jest.fn(),
};

const mockPageService = {
  getTopProductPages: jest.fn(),
  getTopProducts: jest.fn(),
  getProductKpis: jest.fn(),
  getHourlySalesSummary: jest.fn(),
  getProductTypes: jest.fn(),
  getHourlyProductSessionsExport: jest.fn(),
};

jest.mock("../../../services/metricsSnapshotService", () => ({
  normalizeMetricRequest: jest.fn(),
  buildMetricsSnapshotService: jest.fn(() => mockMetricsService),
}));

jest.mock("../../../services/metricsReportService", () => ({
  buildMetricsReportService: jest.fn(() => mockReportService),
  parseHourLte: (...args) => mockParseHourLte(...args),
}));

jest.mock("../../../services/productConversionService", () => ({
  buildProductConversionService: jest.fn(() => ({
    normalizeProductConversionRequest: jest.fn(),
    getProductConversion: jest.fn(),
    getProductConversionCsv: jest.fn(),
  })),
}));

jest.mock("../../../services/metricsPageService", () => ({
  buildMetricsPageService: jest.fn(() => mockPageService),
}));

jest.mock("../../../lib/redis", () => null);
jest.mock("../../../utils/logger", () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock("../../../config/brands", () => ({
  getBrands: jest.fn(() => ({
    TMC: { id: "tmc" },
  })),
}));

jest.mock("../../../lib/brandConnectionManager", () => ({
  getBrandConnection: jest.fn(async () => ({
    sequelize: { query: jest.fn() },
  })),
}));

const { buildMetricsController } = require("../../../controllers/metricsController");

function createRes() {
  return {
    statusCode: 200,
    jsonBody: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.jsonBody = body;
      return this;
    },
    send(body) {
      this.jsonBody = body;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
  };
}

describe("metricsController medium handlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("trafficSourceSplit forwards successful payloads", async () => {
    mockReportService.getTrafficSourceSplit.mockResolvedValue({
      rows: [{ date: "2026-03-10", utm_source: "google" }],
      prev_range: { start: "2026-03-09", end: "2026-03-09" },
    });
    const controller = buildMetricsController();
    const res = createRes();

    await controller.trafficSourceSplit(
      {
        query: { start: "2026-03-10", end: "2026-03-10" },
        brandDb: { sequelize: {} },
      },
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({
      rows: [{ date: "2026-03-10", utm_source: "google" }],
      prev_range: { start: "2026-03-09", end: "2026-03-09" },
    });
  });

  test("trafficSourceSplit returns explicit failure on service errors", async () => {
    mockReportService.getTrafficSourceSplit.mockRejectedValue(new Error("missing table"));
    const controller = buildMetricsController();
    const res = createRes();

    await controller.trafficSourceSplit(
      {
        query: { start: "2026-03-10", end: "2026-03-10" },
        brandDb: { sequelize: {} },
      },
      res,
    );

    expect(res.statusCode).toBe(500);
    expect(res.jsonBody).toEqual({
      error: "Failed to load traffic source split",
    });
  });

  test("paymentSalesSplit forwards successful payloads", async () => {
    mockReportService.getPaymentSalesSplit.mockResolvedValue({
      metric: "PAYMENT_SPLIT_SALES",
      range: { start: "2026-03-10", end: "2026-03-10", hour_lte: 11 },
      cod_sales: 90,
      prepaid_sales: 210,
      partial_sales: 0,
      total_sales_from_split: 300,
      cod_percent: 30,
      prepaid_percent: 70,
      partial_percent: 0,
      sql_used: "SELECT ...",
    });
    const controller = buildMetricsController();
    const res = createRes();

    await controller.paymentSalesSplit(
      {
        query: { start: "2026-03-10", end: "2026-03-10", hour_lte: "11" },
        brandDb: { sequelize: {} },
      },
      res,
    );

    expect(mockParseHourLte).toHaveBeenCalledWith("11");
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.total_sales_from_split).toBe(300);
  });

  test("paymentSalesSplit returns explicit failure on service errors", async () => {
    mockReportService.getPaymentSalesSplit.mockRejectedValue(new Error("boom"));
    const controller = buildMetricsController();
    const res = createRes();

    await controller.paymentSalesSplit(
      {
        query: { start: "2026-03-10", end: "2026-03-10" },
        brandDb: { sequelize: {} },
      },
      res,
    );

    expect(res.statusCode).toBe(500);
    expect(res.jsonBody).toEqual({
      error: "Failed to load payment sales split",
    });
  });

  test("orderSplit delegates to the report service", async () => {
    mockReportService.getOrderSplit.mockResolvedValue({
      metric: "ORDER_SPLIT",
      total_orders_from_split: 35,
    });
    const controller = buildMetricsController();
    const res = createRes();

    await controller.orderSplit(
      {
        query: { start: "2026-03-10", end: "2026-03-10", hour_lte: "11" },
        brandDb: { sequelize: {} },
      },
      res,
    );

    expect(mockReportService.getOrderSplit).toHaveBeenCalledWith({
      conn: {},
      start: "2026-03-10",
      end: "2026-03-10",
      hourLte: 11,
      productId: "",
      filters: {
        device_type: null,
        product_id: null,
        sales_channel: null,
        utm_campaign: null,
        utm_content: null,
        utm_medium: null,
        utm_source: null,
        utm_term: null,
      },
      includeSql: true,
    });
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.total_orders_from_split).toBe(35);
  });

  test("hourlySalesSummary delegates to the page service", async () => {
    mockPageService.getHourlySalesSummary.mockResolvedValue({
      metric: "HOURLY_SALES_SUMMARY",
      brand: "TMC",
      source: "mixed",
      data: {
        today: { date: "2026-03-31", source: "redis", data: [] },
        yesterday: { date: "2026-03-30", source: "db", data: [] },
      },
    });
    const controller = buildMetricsController();
    const res = createRes();

    await controller.hourlySalesSummary(
      {
        brandKey: "TMC",
        query: {},
        brandDb: { sequelize: { query: jest.fn() } },
      },
      res,
    );

    expect(mockPageService.getHourlySalesSummary).toHaveBeenCalledWith({
      conn: expect.any(Object),
      brandKey: "TMC",
    });
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.source).toBe("mixed");
  });

  test("productTypes delegates to the page service", async () => {
    mockPageService.getProductTypes.mockResolvedValue({
      date: "2026-03-31",
      types: ["Bundle"],
    });
    const controller = buildMetricsController();
    const res = createRes();

    await controller.productTypes(
      {
        query: { date: "2026-03-31" },
        brandDb: { sequelize: {} },
      },
      res,
    );

    expect(mockPageService.getProductTypes).toHaveBeenCalledWith({
      conn: {},
      date: "2026-03-31",
    });
    expect(res.jsonBody).toEqual({
      date: "2026-03-31",
      types: ["Bundle"],
    });
  });

  test("hourlyProductSessionsExport delegates csv generation to the page service", async () => {
    mockPageService.getHourlyProductSessionsExport.mockResolvedValue({
      filename: "hourly_product_sessions_TMC_2026-03-31.csv",
      csv: "date,hour\n2026-03-31,11",
    });
    const controller = buildMetricsController();
    const res = createRes();

    await controller.hourlyProductSessionsExport(
      {
        brandKey: "TMC",
        query: { start: "2026-03-31", end: "2026-03-31", product_id: "sku-1" },
        brandDb: { sequelize: {} },
      },
      res,
    );

    expect(mockPageService.getHourlyProductSessionsExport).toHaveBeenCalledWith({
      conn: {},
      brandKey: "TMC",
      start: "2026-03-31",
      end: "2026-03-31",
      filters: { product_id: "sku-1" },
    });
    expect(res.headers["Content-Type"]).toBe("text/csv");
    expect(res.headers["Content-Disposition"]).toBe(
      'attachment; filename="hourly_product_sessions_TMC_2026-03-31.csv"',
    );
    expect(res.jsonBody).toBe("date,hour\n2026-03-31,11");
  });
});
