const { Sequelize, DataTypes } = require('sequelize');

// Warm pool defaults: keep a small set of ready connections and close idle ones after ~10 minutes.
const LRU_MAX = Number(process.env.BRAND_CONN_MAX || 5);
const POOL_MAX = Number(process.env.BRAND_POOL_MAX || 2);
const POOL_MIN = Number(process.env.BRAND_POOL_MIN || 1); // keep one warm conn per pool
const POOL_IDLE = Number(process.env.BRAND_POOL_IDLE || 600_000); // 10 minutes
const POOL_ACQUIRE = Number(process.env.BRAND_POOL_ACQUIRE || 30000);
const POOL_EVICT = Number(process.env.BRAND_POOL_EVICT || 1000);
const CACHE_MAX_IDLE_MS = Number(process.env.BRAND_CONN_IDLE_MS || 600_000); // evict unused pools after 10 minutes
const CLEANUP_INTERVAL_MS = Number(process.env.BRAND_CONN_CLEAN_MS || 60_000);

const cache = new Map();   // brandKey -> { sequelize, models, lastUsed }
const pending = new Map(); // brandKey -> Promise
let isShuttingDown = false;
let cleanupTimer = null;

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
  const host = cfg.proxyHost || process.env.BRAND_PROXY_HOST || cfg.dbHost;
  const port = Number(cfg.proxyPort || process.env.BRAND_PROXY_PORT || cfg.dbPort || 3306);

  const sequelize = new Sequelize(cfg.dbName, cfg.dbUser, cfg.dbPass, {
    host,
    port,
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
    timezone: '+00:00',
    dialectOptions: {
      connectAttributes: {
        program_name: 'dashboard-brand',
        service: 'dashboard-api',
        brand: cfg.key,
        env: process.env.NODE_ENV || 'development',
      },
    },
  });

  await sequelize.authenticate();
  const models = defineModels(sequelize);
  return { sequelize, models };
}

async function evictIfNeeded() {
  if (cache.size <= LRU_MAX) return;
  let oldestKey = null; let oldestTime = Infinity;
  for (const [k, v] of cache.entries()) {
    if (v.lastUsed < oldestTime) { oldestTime = v.lastUsed; oldestKey = k; }
  }
  if (oldestKey) {
    const entry = cache.get(oldestKey);
    cache.delete(oldestKey);
    try { await entry.sequelize.close(); } catch (e) { console.error(`[brandConnectionManager] Failed to close evicted pool for ${oldestKey}:`, e.message); }
  }
}

async function pruneStale(now = Date.now()) {
  const stale = [];
  for (const [key, entry] of cache.entries()) {
    if (now - entry.lastUsed > CACHE_MAX_IDLE_MS) stale.push([key, entry]);
  }
  for (const [key, entry] of stale) {
    cache.delete(key);
    try { await entry.sequelize.close(); } catch (e) { console.error(`[brandConnectionManager] Failed to close stale pool for ${key}:`, e.message); }
  }
}

function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    if (isShuttingDown) return;
    pruneStale().catch(() => {});
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref?.();
}

async function getBrandConnection(brandCfg) {
  if (isShuttingDown) throw new Error('Server is shutting down, cannot acquire new connections');
  const key = brandCfg.key;
  const now = Date.now();
  await pruneStale(now);

  if (cache.has(key)) {
    const entry = cache.get(key);
    entry.lastUsed = now;
    if (!entry.models.User) {
      const models = defineModels(entry.sequelize);
      entry.models = { ...entry.models, ...models };
    }
    return entry;
  }

  if (pending.has(key)) {
    await pending.get(key);
    const entry = cache.get(key);
    if (entry) {
      entry.lastUsed = now;
      return entry;
    }
  }

  const createPromise = (async () => {
    try {
      const created = await createConnection(brandCfg);
      const entry = { ...created, lastUsed: Date.now() };
      cache.set(key, entry);
      await evictIfNeeded();
      await pruneStale();
      return entry;
    } finally {
      pending.delete(key);
    }
  })();

  pending.set(key, createPromise);
  return createPromise;
}

async function closeAll() {
  isShuttingDown = true;
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  const promises = [];
  for (const [key, entry] of cache.entries()) {
    promises.push(
      entry.sequelize.close().catch((e) => console.error(`[brandConnectionManager] Failed to close ${key}:`, e.message))
    );
  }
  await Promise.all(promises);
  cache.clear();
}

function getStats() {
  return {
    cachedBrands: cache.size,
    maxCachedBrands: LRU_MAX,
    poolSettings: { max: POOL_MAX, min: POOL_MIN, idle: POOL_IDLE, acquire: POOL_ACQUIRE },
    brands: Array.from(cache.keys()),
  };
}

// start periodic cleanup on module load
startCleanup();

module.exports = { getBrandConnection, closeAll, getStats, cache };
