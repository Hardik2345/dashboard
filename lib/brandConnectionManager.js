const { Sequelize, DataTypes } = require('sequelize');

// Conservative defaults: limit connections to prevent exhaustion
// Total max connections = LRU_MAX * POOL_MAX (e.g., 5 brands * 2 conns = 10)
const LRU_MAX = Number(process.env.BRAND_CONN_MAX || 5);
const POOL_MAX = Number(process.env.BRAND_POOL_MAX || 2);  // Very conservative
const POOL_MIN = Number(process.env.BRAND_POOL_MIN || 0); // 0 = release all idle connections
const POOL_IDLE = Number(process.env.BRAND_POOL_IDLE || 10000); // 10 seconds idle before release
const POOL_ACQUIRE = Number(process.env.BRAND_POOL_ACQUIRE || 30000);
const POOL_EVICT = Number(process.env.BRAND_POOL_EVICT || 1000);

const cache = new Map(); // brandKey -> { sequelize, models, lastUsed }
const pending = new Map(); // brandKey -> Promise (to prevent race conditions)
let isShuttingDown = false;

function defineModels(sequelize) {
  const OverallSummary = sequelize.define(
    'overall_summary',
    {
      date: { type: DataTypes.DATEONLY },
      total_sales: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
      total_orders: { type: DataTypes.DECIMAL(43,0), allowNull: false, defaultValue: 0 },
      total_sessions: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      total_atc_sessions: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      cod_orders: { type: DataTypes.INTEGER, allowNull: true },
      prepaid_orders: { type: DataTypes.INTEGER, allowNull: true },
    },
    { tableName: 'overall_summary', timestamps: false }
  );
  const PipelineMetadata = sequelize.define(
    'pipeline_metadata',
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      key_name: { type: DataTypes.STRING },
      key_value: { type: DataTypes.STRING },
    },
    { tableName: 'pipeline_metadata', timestamps: false }
  );
  const User = sequelize.define('user', {
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, allowNull: false, defaultValue: 'user' },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  }, { tableName: 'users', timestamps: true });

  return { OverallSummary, PipelineMetadata, User };
}

async function createConnection(cfg) {
  console.log(`[brandConnectionManager] Creating new connection pool for ${cfg.key}`);
  const sequelize = new Sequelize(cfg.dbName, cfg.dbUser, cfg.dbPass, {
    host: cfg.dbHost,
    port: cfg.dbPort,
    dialect: 'mysql',
    dialectModule: require('mysql2'),
    pool: {
      max: POOL_MAX,
      min: POOL_MIN,
      idle: POOL_IDLE,
      acquire: POOL_ACQUIRE,
      evict: POOL_EVICT,
    },
    logging: false,
    timezone: '+00:00'
  });
  await sequelize.authenticate();
  console.log(`[brandConnectionManager] Pool created for ${cfg.key} (max: ${POOL_MAX}, min: ${POOL_MIN})`);
  const models = defineModels(sequelize);
  return { sequelize, models };
}

async function evictIfNeeded() {
  if (cache.size <= LRU_MAX) return;
  // Evict least recently used
  let oldestKey = null; let oldestTime = Infinity;
  for (const [k,v] of cache.entries()) {
    if (v.lastUsed < oldestTime) { oldestTime = v.lastUsed; oldestKey = k; }
  }
  if (oldestKey) {
    const entry = cache.get(oldestKey);
    cache.delete(oldestKey);
    try {
      await entry.sequelize.close();
    } catch (e) {
      console.error(`[brandConnectionManager] Failed to close pool for ${oldestKey}:`, e.message);
    }
  }
}

// Only health-check if connection hasn't been used in this many ms
const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

async function getBrandConnection(brandCfg) {
  if (isShuttingDown) {
    throw new Error('Server is shutting down, cannot acquire new connections');
  }
  const key = brandCfg.key;
  const now = Date.now();
  
  // Return cached connection if available
  if (cache.has(key)) {
    const entry = cache.get(key);
    const timeSinceLastUse = now - entry.lastUsed;
    
    // Only health-check if connection is stale (not used in 5+ minutes)
    if (timeSinceLastUse > HEALTH_CHECK_INTERVAL) {
      try {
        await entry.sequelize.authenticate();
      } catch (e) {
        // Connection is dead, remove from cache and recreate
        console.warn(`[brandConnectionManager] Stale connection for ${key}, recreating...`);
        cache.delete(key);
        try {
          await entry.sequelize.close();
        } catch (_) { /* ignore close errors */ }
        // Fall through to create new connection
      }
    }
    
    // If still in cache, return it
    if (cache.has(key)) {
      entry.lastUsed = now;
      // Ensure backward compatibility if models previously lacked User
      if (!entry.models.User) {
        const models = defineModels(entry.sequelize);
        entry.models = { ...entry.models, ...models };
      }
      return entry;
    }
  }
  
  // If another request is already creating this connection, wait for it
  if (pending.has(key)) {
    console.log(`[brandConnectionManager] Waiting for pending connection for ${key}...`);
    await pending.get(key);
    // Now it should be in cache
    if (cache.has(key)) {
      const entry = cache.get(key);
      entry.lastUsed = now;
      return entry;
    }
  }
  
  // Create new connection with lock to prevent race conditions
  const createPromise = (async () => {
    try {
      const created = await createConnection(brandCfg);
      const entry = { ...created, lastUsed: Date.now() };
      cache.set(key, entry);
      await evictIfNeeded();
      return entry;
    } finally {
      pending.delete(key);
    }
  })();
  
  pending.set(key, createPromise);
  return createPromise;
}

/**
 * Close all cached brand connections. Call this on graceful shutdown.
 */
async function closeAll() {
  isShuttingDown = true;
  const closePromises = [];
  for (const [key, entry] of cache.entries()) {
    console.log(`[brandConnectionManager] Closing connection pool for ${key}...`);
    closePromises.push(
      entry.sequelize.close().catch((e) => {
        console.error(`[brandConnectionManager] Failed to close ${key}:`, e.message);
      })
    );
  }
  await Promise.all(closePromises);
  cache.clear();
  console.log('[brandConnectionManager] All brand connections closed.');
}

/**
 * Get current cache statistics for monitoring.
 */
function getStats() {
  return {
    cachedBrands: cache.size,
    maxCachedBrands: LRU_MAX,
    poolSettings: { max: POOL_MAX, min: POOL_MIN, idle: POOL_IDLE, acquire: POOL_ACQUIRE },
    brands: Array.from(cache.keys()),
  };
}

module.exports = { getBrandConnection, closeAll, getStats, cache };
