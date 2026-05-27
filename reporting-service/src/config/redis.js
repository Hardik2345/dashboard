const Redis = require("ioredis");
const { env } = require("./env");
const logger = require("../utils/logger");

let redis;

function getRedis() {
  if (!env.REDIS_URL) return null;
  if (!redis) {
    redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    redis.on("error", (err) => logger.warn("[reporting-service] redis error", { error: err.message }));
  }
  return redis;
}

module.exports = { getRedis };
