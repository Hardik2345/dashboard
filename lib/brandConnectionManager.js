const { Sequelize, DataTypes } = require('sequelize');

// Conservative defaults: limit connections to prevent exhaustion
// Total max connections = LRU_MAX * POOL_MAX (e.g., 5 brands * 3 conns = 15)
const LRU_MAX = Number(process.env.BRAND_CONN_MAX || 5);
const POOL_MAX = Number(process.env.BRAND_POOL_MAX || 3);
const POOL_MIN = Number(process.env.BRAND_POOL_MIN || 1);
const POOL_IDLE = Number(process.env.BRAND_POOL_IDLE || 30000);
const POOL_ACQUIRE = Number(process.env.BRAND_POOL_ACQUIRE || 60000);
const POOL_EVICT = Number(process.env.BRAND_POOL_EVICT || 1000);

const cache = new Map(); // brandKey -> { sequelize, models, lastUsed }
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

async function getBrandConnection(brandCfg) {
  if (isShuttingDown) {
    throw new Error('Server is shutting down, cannot acquire new connections');
  }
  const key = brandCfg.key;
  const now = Date.now();
  if (cache.has(key)) {
    const entry = cache.get(key);
    // Health check: verify connection is still alive
    try {
      await entry.sequelize.authenticate();
      entry.lastUsed = now;
      // Ensure backward compatibility if models previously lacked User
      if (!entry.models.User) {
        const models = defineModels(entry.sequelize);
        entry.models = { ...entry.models, ...models };
      }
      return entry;
    } catch (e) {
      // Connection is dead, remove from cache and recreate
      console.warn(`[brandConnectionManager] Stale connection for ${key}, recreating...`);
      cache.delete(key);
      try {
        await entry.sequelize.close();
      } catch (_) { /* ignore close errors */ }
    }
  }
  const created = await createConnection(brandCfg);
  const entry = { ...created, lastUsed: now };
  cache.set(key, entry);
  await evictIfNeeded();
  return entry;
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
