/* eslint-env jest */

const {
  parseRangeQuery,
  ensureBrandSequelize,
} = require("../../../controllers/metricsControllerSupport");

describe("metricsControllerSupport", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("returns a 400 payload for invalid ranges", () => {
    const result = parseRangeQuery({ start: "2026-03-31", end: "bad-date" });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Invalid date range");
    expect(result.body.details).toBeDefined();
  });

  test("defaults both dates to today when requested", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-03-31T06:30:00Z"));

    const result = parseRangeQuery({}, { defaultToToday: true });

    expect(result).toEqual({
      ok: true,
      data: { start: "2026-03-31", end: "2026-03-31" },
    });
    jest.useRealTimers();
  });

  test("returns a stable missing-connection error", () => {
    const result = ensureBrandSequelize({});

    expect(result).toEqual({
      ok: false,
      status: 500,
      body: { error: "Brand DB connection unavailable" },
    });
  });

  test("returns the sequelize connection when present", () => {
    const conn = { query: jest.fn() };
    const result = ensureBrandSequelize({ brandDb: { sequelize: conn } });

    expect(result).toEqual({
      ok: true,
      conn,
    });
  });
});
