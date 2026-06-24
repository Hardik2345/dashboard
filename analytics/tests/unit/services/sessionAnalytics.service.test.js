/* eslint-env jest */

const mockRepository = {
  getSummary: jest.fn(),
  getTrend: jest.fn(),
  getBrandRows: jest.fn(),
  getUserRows: jest.fn(),
  getInsights: jest.fn(),
  getFilters: jest.fn(),
  getBrandExportCsv: jest.fn(),
  getUserExportCsv: jest.fn(),
};

jest.mock("../../../db/sessionAnalytics.mongo", () => ({
  connectSessionAnalyticsMongo: jest.fn(async () => ({})),
}));

jest.mock("../../../repositories/sessionAnalytics.repository", () => ({
  buildSessionAnalyticsRepository: jest.fn(() => mockRepository),
}));

describe("sessionAnalyticsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("scopes viewers to assigned brands and excludes admin sessions", async () => {
    const service = require("../../../services/sessionAnalytics.service");
    mockRepository.getUserRows.mockResolvedValue({ rows: [], total: 0 });

    await service.getUsers({
      user: {
        isAuthor: false,
        allowedBrands: ["TMC", "BBB"],
      },
      query: {
        from: "2026-06-01",
        to: "2026-06-24",
      },
    });

    expect(mockRepository.getUserRows).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: {
          includeAdmins: false,
          allowedBrands: ["TMC", "BBB"],
        },
      }),
    );
  });

  test("allows authors to query all brands including admin sessions", async () => {
    const service = require("../../../services/sessionAnalytics.service");
    mockRepository.getSummary.mockResolvedValue({
      totalSessions: 12,
      uniqueUsers: 3,
      sessionsPerUser: 4,
      activeBrands: 2,
    });

    await service.getSummary({
      user: {
        isAuthor: true,
      },
      query: {},
    });

    expect(mockRepository.getSummary).toHaveBeenCalledWith({
      scope: {
        includeAdmins: true,
        allowedBrands: null,
      },
      filters: {
        from: null,
        to: null,
        brand: "",
        user: "",
        search: "",
      },
    });
  });

  test("defaults to hourly granularity for a single-day range and enriches latest session insight", async () => {
    const service = require("../../../services/sessionAnalytics.service");
    mockRepository.getTrend.mockResolvedValue([{ label: "00:00", sessions: 1 }]);
    mockRepository.getInsights.mockResolvedValue({
      mostActiveUser: { email: "user@example.com", sessionCount: 4 },
      mostActiveBrand: { brand: "TMC", sessionCount: 4 },
      latestSession: {
        email: "user@example.com",
        brand: "TMC",
        timestamp: "2026-06-24T10:00:00.000Z",
      },
    });

    const trend = await service.getTrend({
      user: { isAuthor: true },
      query: { from: "2026-06-24", to: "2026-06-24" },
    });
    const insights = await service.getInsights({
      user: { isAuthor: true },
      query: {},
    });

    expect(mockRepository.getTrend).toHaveBeenCalledWith(
      expect.objectContaining({ granularity: "hourly" }),
    );
    expect(trend).toHaveLength(24);
    expect(trend[0]).toEqual({ label: "00:00", sessions: 1 });
    expect(insights.latestSession.timeAgo).toMatch(/ago$/);
  });
});
