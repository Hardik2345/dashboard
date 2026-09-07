/* eslint-env jest */

const mockReportService = {
  getTrafficSourceSplit: jest.fn(),
};

jest.mock("../../../../modules/metrics/requestNormalizer", () => ({
  parseRangeQuery: jest.fn(() => ({
    ok: true,
    data: { start: "2026-07-01", end: "2026-07-06" },
  })),
  ensureBrandSequelize: jest.fn(() => ({
    ok: true,
    conn: {},
  })),
}));

jest.mock("../../../../shared/utils/filters", () => ({
  extractFilters: jest.fn(() => ({})),
}));

jest.mock("../../../../services/metricsReportService", () => ({
  parseHourLte: jest.fn(() => ({ hourLte: null })),
}));

const { buildSplitController } = require("../../../../modules/metrics/splitController");

function createRes() {
  return {
    statusCode: 200,
    jsonBody: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.jsonBody = body;
      return this;
    },
  };
}

describe("splitController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("trafficSourceSplit forwards product_id to the report service", async () => {
    mockReportService.getTrafficSourceSplit.mockResolvedValue({
      rows: [],
      prev_range: { start: "2026-06-25", end: "2026-06-30" },
    });
    const controller = buildSplitController({ reportService: mockReportService });
    const res = createRes();

    await controller.trafficSourceSplit(
      {
        query: {
          start: "2026-07-01",
          end: "2026-07-06",
          product_id: ["7987757023402", "7987757383850"],
          compare_start: "2026-06-25",
          compare_end: "2026-06-30",
        },
        tenantRoute: { timezone: "Asia/Kolkata" },
      },
      res,
    );

    expect(mockReportService.getTrafficSourceSplit).toHaveBeenCalledWith({
      conn: {},
      start: "2026-07-01",
      end: "2026-07-06",
      compareStart: "2026-06-25",
      compareEnd: "2026-06-30",
      productId: ["7987757023402", "7987757383850"],
      timezone: "Asia/Kolkata",
    });
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({
      rows: [],
      prev_range: { start: "2026-06-25", end: "2026-06-30" },
    });
  });
});
