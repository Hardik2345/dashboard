/* eslint-env jest */

const { buildMetricsCacheService } = require("../../../services/metricsCacheService");

describe("metricsCacheService", () => {
  test("returns in-memory cached values without hitting redis", async () => {
    const cache = new Map();
    cache.set("metrics:tmc:2026-03-31", {
      timestamp: Date.now(),
      data: { total_orders: 10 },
      promise: null,
    });
    const client = { get: jest.fn() };
    const service = buildMetricsCacheService({
      cache,
      client,
      log: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    const result = await service.fetchCachedMetrics("TMC", "2026-03-31");

    expect(result).toEqual({ total_orders: 10 });
    expect(client.get).not.toHaveBeenCalled();
  });

  test("fetches a single key from redis and stores it in memory cache", async () => {
    const cache = new Map();
    const client = {
      get: jest.fn().mockResolvedValue(JSON.stringify({ total_sales: 123 })),
    };
    const service = buildMetricsCacheService({
      cache,
      client,
      log: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    const result = await service.fetchCachedMetrics("TMC", "2026-03-31");

    expect(result).toEqual({ total_sales: 123 });
    expect(cache.get("metrics:tmc:2026-03-31").data).toEqual({
      total_sales: 123,
    });
  });

  test("fetches missing keys in batch via redis mget", async () => {
    const cache = new Map();
    cache.set("metrics:tmc:2026-03-30", {
      timestamp: Date.now(),
      data: { total_orders: 8 },
      promise: null,
    });
    const client = {
      mget: jest.fn().mockResolvedValue([
        JSON.stringify({ total_orders: 9 }),
      ]),
    };
    const service = buildMetricsCacheService({
      cache,
      client,
      log: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    const result = await service.fetchCachedMetricsBatch("TMC", [
      "2026-03-30",
      "2026-03-31",
    ]);

    expect(result).toEqual([{ total_orders: 8 }, { total_orders: 9 }]);
    expect(client.mget).toHaveBeenCalledWith(["metrics:tmc:2026-03-31"]);
  });

  test("falls back to null on redis errors without throwing", async () => {
    const log = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const service = buildMetricsCacheService({
      cache: new Map(),
      client: { get: jest.fn().mockRejectedValue(new Error("boom")) },
      log,
    });

    const result = await service.fetchCachedMetrics("TMC", "2026-03-31");

    expect(result).toBeNull();
    expect(log.error).toHaveBeenCalledWith(
      "[REDIS ERROR] Fetch failed for metrics:tmc:2026-03-31",
      "boom",
    );
  });

  test("builds hourly sales summary payload with mixed redis and db sources", async () => {
    const client = {
      mget: jest.fn().mockResolvedValue([
        JSON.stringify([{ hour: 12, total_sales: 100 }]),
        null,
      ]),
    };
    const conn = {
      query: jest.fn().mockResolvedValue([
        {
          date: "2026-03-30",
          hour: 11,
          total_sales: 90,
          number_of_orders: 3,
          number_of_sessions: 50,
          number_of_atc_sessions: 10,
        },
      ]),
    };
    const service = buildMetricsCacheService({
      cache: new Map(),
      client,
      log: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    const result = await service.getHourlySalesSummary({
      brandKey: "TMC",
      conn,
      now: new Date("2026-03-31T06:30:00Z"),
    });

    expect(result.metric).toBe("HOURLY_SALES_SUMMARY");
    expect(result.brand).toBe("TMC");
    expect(result.source).toBe("mixed");
    expect(result.data.today.source).toBe("redis");
    expect(result.data.yesterday.source).toBe("db");
    expect(conn.query).toHaveBeenCalledTimes(1);
    expect(result.data.yesterday.data).toEqual([
      {
        hour: 11,
        total_sales: 90,
        number_of_orders: 3,
        number_of_sessions: 50,
        number_of_atc_sessions: 10,
      },
    ]);
  });
});
