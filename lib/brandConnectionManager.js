const mysql = require('mysql2/promise');
const mysqlCore = require('mysql2');
const { QueryTypes } = require('sequelize');
const { getBrands } = require('../config/brands');

const POOL_MAX = Number(process.env.BRAND_POOL_MAX || 5);
const POOL_IDLE = Number(process.env.BRAND_POOL_IDLE || 600_000);
const POOL_ACQUIRE = Number(process.env.BRAND_POOL_ACQUIRE || 30000);
const POOL_MIN = Number(process.env.BRAND_POOL_MIN || 1);

function resolveBaseConfig() {
  const brands = getBrands();
  const firstBrand = Object.values(brands)[0] || {};
  const host =
    process.env.BRAND_PROXY_HOST ||
    process.env.BRAND_DB_HOST ||
    process.env.DB_PROXY_HOST ||
    process.env.DB_HOST ||
    firstBrand.dbHost;
  const port = Number(
    process.env.BRAND_PROXY_PORT ||
    process.env.BRAND_DB_PORT ||
    process.env.DB_PROXY_PORT ||
    process.env.DB_PORT ||
    firstBrand.dbPort ||
    3306
  );
  const user = process.env.BRAND_DB_USER || process.env.DB_USER || firstBrand.dbUser;
  const password = process.env.BRAND_DB_PASS || process.env.DB_PASS || firstBrand.dbPass;
  // Base DB can be anything this user can connect to; we switch with USE for each brand.
  const database = process.env.BRAND_DEFAULT_DB || process.env.DB_NAME || 'mysql';
  return { host, port, user, password, database };
}

const baseConfig = resolveBaseConfig();

// Single pool shared across all logical brand databases; user must have access to all schemas.
const pool = mysql.createPool({
  host: baseConfig.host,
  port: baseConfig.port,
  user: baseConfig.user,
  password: baseConfig.password,
  database: baseConfig.database,
  dateStrings: true, // keep DATE/DATETIME as strings to match previous Sequelize behavior
  waitForConnections: true,
  connectionLimit: POOL_MAX,
  maxIdle: POOL_MIN,
  idleTimeout: POOL_IDLE,
  queueLimit: 0,
  enableKeepAlive: true,
  acquireTimeout: POOL_ACQUIRE,
});

const brandClients = new Map(); // brandKey -> { sequelize, dbName, key }
let isClosed = false;

function formatSql(sql, replacements) {
  if (!replacements) return sql;
  return mysqlCore.format(sql, replacements);
}

async function runQuery(dbName, sql, options = {}) {
  if (isClosed) throw new Error('Brand connection pool is closed');
  const conn = await pool.getConnection();
  try {
    // Switch schema without reauth; cheaper than changeUser and keeps socket warm
    await conn.query('USE ??', [dbName]);
    const finalSql = options.replacements ? formatSql(sql, options.replacements) : sql;
    const [rows] = await conn.query(finalSql);
    if (options.type === QueryTypes.SELECT) return rows;
    return rows;
  } finally {
    conn.release();
  }
}

async function testConnection(dbName) {
  await runQuery(dbName, 'SELECT 1');
  return true;
}

function getBrandConnection(brandCfg) {
  if (!brandCfg || !brandCfg.key) throw new Error('brandCfg.key required');
  const key = brandCfg.key.toUpperCase();
  if (brandClients.has(key)) return brandClients.get(key);

  const dbName = brandCfg.dbName || brandCfg.key;

  const client = {
    key,
    dbName,
    sequelize: {
      query: (sql, options = {}) => runQuery(dbName, sql, options),
      authenticate: () => testConnection(dbName),
      // No-op close to preserve backward compatibility with callers expecting a close() method
      close: async () => {},
    },
    models: {},
  };

  brandClients.set(key, client);
  return client;
}

async function closeAll() {
  isClosed = true;
  brandClients.clear();
  try {
    await pool.end();
  } catch (e) {
    console.error('[brandConnectionManager] Failed to close pool', e);
  }
}

function getStats() {
  const poolStats = pool.pool || pool; // mysql2/promise exposes underlying pool as .pool
  const size = poolStats?._allConnections?.length || 0;
  const free = poolStats?._freeConnections?.length || 0;
  return {
    cachedBrands: brandClients.size,
    poolSettings: { max: POOL_MAX, idleMs: POOL_IDLE },
    poolUsage: { size, free },
    brands: Array.from(brandClients.keys()),
  };
}

module.exports = { getBrandConnection, closeAll, getStats };
