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
} else {
  console.warn('[REDIS] No REDIS_URL provided, caching will be disabled.');
}

module.exports = redisClient;
