const { QueryTypes } = require("sequelize");
const redisClient = require("../lib/redis");
const logger = require("../utils/logger");
const { getNowIst, formatUtcDate } = require("./metricsFoundation");

const MEM_CACHE = new Map();
const CACHE_TTL_MS = 60 * 1000;

function buildMetricsCacheService({
  cache = MEM_CACHE,
  ttlMs = CACHE_TTL_MS,
  client = redisClient,
  log = logger,
} = {}) {
  async function fetchCachedMetrics(brandKey, date) {
    const key = `metrics:${brandKey.toLowerCase()}:${date}`;
    const now = Date.now();

    if (cache.has(key)) {
      const entry = cache.get(key);
      if (now - entry.timestamp < ttlMs) {
        if (entry.promise) {
          log.debug(`[MEM CACHE] Reuse pending request for ${brandKey} on ${date}`);
          return entry.promise;
        }
        log.debug(`[MEM CACHE] Hit for ${brandKey} on ${date}`);
        return entry.data;
      }
      cache.delete(key);
    }

    const promise = (async () => {
      try {
        let data = null;
        if (client) {
          const raw = await client.get(key);
          if (raw) {
            data = JSON.parse(raw);
            log.debug(`[REDIS HIT] ${key}`);
          } else {
            log.debug(`[REDIS MISS] ${key}`);
          }
        } else {
          log.warn("[REDIS SKIP] Client not available");
        }

        if (data) {
          cache.set(key, {
            timestamp: Date.now(),
            data,
            promise: null,
          });
          return data;
        }

        return null;
      } catch (error) {
        log.error(`[REDIS ERROR] Fetch failed for ${key}`, error.message);
        cache.delete(key);
        return null;
      } finally {
        const entry = cache.get(key);
        if (entry && entry.promise) {
          cache.delete(key);
        }
      }
    })();

    cache.set(key, { timestamp: now, data: null, promise });
    return promise;
  }

  async function fetchCachedMetricsBatch(brandKey, dates) {
    const keys = dates.map((date) => `metrics:${brandKey.toLowerCase()}:${date}`);
    const now = Date.now();
    const results = new Array(dates.length).fill(null);
    const missingIndices = [];
    const missingKeys = [];

    keys.forEach((key, index) => {
      if (cache.has(key)) {
        const entry = cache.get(key);
        if (now - entry.timestamp < ttlMs && entry.data) {
          log.debug(`[MEM CACHE] Hit for ${key}`);
          results[index] = entry.data;
          return;
        }
        if (now - entry.timestamp >= ttlMs) {
          cache.delete(key);
        }
      }
      missingIndices.push(index);
      missingKeys.push(key);
    });

    if (missingKeys.length === 0) {
      return results;
    }

    try {
      if (client) {
        log.debug(`[REDIS MGET] Fetching ${missingKeys.length} keys`);
        const rawValues = await client.mget(missingKeys);
        rawValues.forEach((raw, index) => {
          const originalIndex = missingIndices[index];
          const key = missingKeys[index];
          if (raw) {
            const data = JSON.parse(raw);
            cache.set(key, { timestamp: now, data, promise: null });
            results[originalIndex] = data;
            log.debug(`[REDIS HIT] ${key}`);
          } else {
            log.debug(`[REDIS MISS] ${key}`);
          }
        });
      } else {
        log.warn("[REDIS SKIP] Client not available");
      }
    } catch (error) {
      log.error("[REDIS BATCH ERROR]", error.message);
    }

    return results;
  }

  async function fetchHourlySalesRows(conn, date) {
    const rows = await conn.query(
      `
        SELECT 
          hour,
          total_sales,
          number_of_orders,
          COALESCE(adjusted_number_of_sessions, number_of_sessions) AS number_of_sessions,
          number_of_atc_sessions
        FROM hour_wise_sales
        WHERE date = ?
        ORDER BY hour ASC
      `,
      {
        type: QueryTypes.SELECT,
        replacements: [date],
      },
    );

    return rows.map((row) => ({
      hour: row.hour,
      total_sales: Number(row.total_sales || 0),
      number_of_orders: Number(row.number_of_orders || 0),
      number_of_sessions: Number(row.number_of_sessions || 0),
      number_of_atc_sessions: Number(row.number_of_atc_sessions || 0),
    }));
  }

  async function getHourlySalesSummary({
    brandKey,
    conn,
    now = new Date(),
  }) {
    const nowIst = getNowIst(now);
    const todayStr = formatUtcDate(nowIst);
    const yesterdayStr = formatUtcDate(
      new Date(nowIst.getTime() - 24 * 60 * 60 * 1000),
    );

    const keyToday = `hourly_metrics:${brandKey.toLowerCase()}:${todayStr}`;
    const keyYesterday = `hourly_metrics:${brandKey.toLowerCase()}:${yesterdayStr}`;

    let todayData = null;
    let yesterdayData = null;
    let todaySource = "db";
    let yesterdaySource = "db";

    if (client) {
      try {
        const results = await client.mget(keyToday, keyYesterday);
        if (results[0]) {
          todayData = JSON.parse(results[0]);
          todaySource = "redis";
          log.debug(`[REDIS HIT] ${keyToday}`);
        } else {
          log.debug(`[REDIS MISS] ${keyToday}`);
        }
        if (results[1]) {
          yesterdayData = JSON.parse(results[1]);
          yesterdaySource = "redis";
          log.debug(`[REDIS HIT] ${keyYesterday}`);
        } else {
          log.debug(`[REDIS MISS] ${keyYesterday}`);
        }
      } catch (error) {
        log.error("[hourlySalesSummary] Redis fetch failed", error.message);
      }
    } else {
      log.warn("[REDIS SKIP] Client not available");
    }

    if (!todayData) {
      todayData = await fetchHourlySalesRows(conn, todayStr);
      log.debug(`[DB FETCH] hourly sales for ${brandKey} on ${todayStr}`);
    }
    if (!yesterdayData) {
      yesterdayData = await fetchHourlySalesRows(conn, yesterdayStr);
      log.debug(`[DB FETCH] hourly sales for ${brandKey} on ${yesterdayStr}`);
    }

    return {
      metric: "HOURLY_SALES_SUMMARY",
      brand: brandKey,
      source:
        todaySource === "redis" && yesterdaySource === "redis"
          ? "redis"
          : todaySource === "redis" || yesterdaySource === "redis"
            ? "mixed"
            : "db",
      data: {
        today: {
          date: todayStr,
          source: todaySource,
          data: todayData || [],
        },
        yesterday: {
          date: yesterdayStr,
          source: yesterdaySource,
          data: yesterdayData || [],
        },
      },
    };
  }

  return {
    fetchCachedMetrics,
    fetchCachedMetricsBatch,
    getHourlySalesSummary,
  };
}

module.exports = {
  buildMetricsCacheService,
};
