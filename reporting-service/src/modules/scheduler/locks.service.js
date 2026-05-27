const { randomUUID } = require("crypto");
const { getRedis } = require("../../config/redis");

async function acquireLock(key, ttlMs = 5 * 60 * 1000) {
  const redis = getRedis();
  if (!redis) return { acquired: true, token: "no-redis" };
  if (redis.status === "wait") await redis.connect();
  const token = randomUUID();
  const result = await redis.set(key, token, "PX", ttlMs, "NX");
  return { acquired: result === "OK", token };
}

async function releaseLock(key, token) {
  const redis = getRedis();
  if (!redis || token === "no-redis") return;
  const current = await redis.get(key);
  if (current === token) await redis.del(key);
}

module.exports = { acquireLock, releaseLock };
