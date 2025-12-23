const Redis = require('ioredis');

let redisClient = null;

if (process.env.REDIS_URL) {
  console.log('[REDIS] Initializing client...');
  redisClient = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > 3) {
        console.warn('[REDIS] Connection failed, switching to offline mode');
        return null; // Stop retrying
      }
      return Math.min(times * 100, 2000);
    }
  });

  redisClient.on('error', (err) => {
    console.error('[REDIS] Error:', err.message);
  });

  redisClient.on('connect', () => {
    console.log('[REDIS] Connected successfully');
  });

  // Provide a small compatibility layer so connect-redis (built for node-redis v4)
  // can work with ioredis.
  redisClient.mGet = (...args) => redisClient.mget(...args);
  redisClient.del = (keys) => {
    if (Array.isArray(keys)) return redisClient.call('DEL', ...keys);
    return redisClient.call('DEL', keys);
  };
  redisClient.set = (key, value, options) => {
    if (options && options.expiration) {
      const { type, value: ttl } = options.expiration;
      return redisClient.call('SET', key, value, type, ttl);
    }
    return redisClient.call('SET', key, value);
  };
  redisClient.expire = (key, ttl) => redisClient.call('EXPIRE', key, ttl);
  redisClient.scanIterator = ({ MATCH = '*', COUNT = 10 } = {}) => ({
    async *[Symbol.asyncIterator]() {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redisClient.scan(cursor, 'MATCH', MATCH, 'COUNT', COUNT);
        cursor = nextCursor;
        if (keys && keys.length) yield keys;
      } while (cursor !== '0');
    }
  });
} else {
  console.warn('[REDIS] No REDIS_URL provided, caching will be disabled.');
}

module.exports = redisClient;
