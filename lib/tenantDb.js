const mysql = require('mysql2/promise');
const mysqlCore = require('mysql2');
const { QueryTypes } = require('sequelize');

const POOL_MAX = Number(process.env.BRAND_POOL_MAX || 5);
const POOL_IDLE = Number(process.env.BRAND_POOL_IDLE || 600_000);
const POOL_ACQUIRE = Number(process.env.BRAND_POOL_ACQUIRE || 30000);
const POOL_MIN = Number(process.env.BRAND_POOL_MIN || 1);

function baseCreds() {
  return {
    user: process.env.BRAND_DB_USER || process.env.DB_USER,
    password: process.env.BRAND_DB_PASS || process.env.DB_PASS,
    host: process.env.BRAND_PROXY_HOST || process.env.BRAND_DB_HOST || process.env.DB_PROXY_HOST || process.env.DB_HOST,
    port: Number(process.env.BRAND_PROXY_PORT || process.env.BRAND_DB_PORT || process.env.DB_PROXY_PORT || process.env.DB_PORT || 3306),
  };
}

const pools = new Map(); // key: host:port:dbName
let closed = false;

function poolKey({ host, port, dbName }) {
  return `${host || 'localhost'}:${port || 3306}:${dbName}`;
}

function formatSql(sql, replacements) {
  if (!replacements) return sql;
  return mysqlCore.format(sql, replacements);
}

function ensurePool(route) {
  if (closed) throw new Error('tenant DB manager closed');
  const creds = baseCreds();
  const host = route.dbHost || creds.host;
  const port = Number(route.dbPort || creds.port || 3306);
  const user = creds.user;
  const password = creds.password;
  const dbName = route.dbName || route.brandId;

  if (!user || !password || !host || !dbName) {
    throw new Error('Missing DB credentials for tenant connection');
  }

  const key = poolKey({ host, port, dbName });
  if (pools.has(key)) return pools.get(key);

  const pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database: dbName,
    waitForConnections: true,
    connectionLimit: POOL_MAX,
    maxIdle: POOL_MIN,
    idleTimeout: POOL_IDLE,
    queueLimit: 0,
    enableKeepAlive: true,
    acquireTimeout: POOL_ACQUIRE,
    ssl: { rejectUnauthorized: false },
  });

  pools.set(key, pool);
  return pool;
}

async function runQuery(pool, sql, options = {}) {
  const conn = await pool.getConnection();
  try {
    const finalSql = options.replacements ? formatSql(sql, options.replacements) : sql;
    const [rows] = await conn.query(finalSql);
    if (options.type === QueryTypes.SELECT) return rows;
    return rows;
  } finally {
    conn.release();
  }
}

function getTenantConnection(route) {
  const pool = ensurePool(route);
  const dbName = route.dbName || route.brandId;
  return {
    key: route.brandId,
    dbName,
    sequelize: {
      query: (sql, options = {}) => runQuery(pool, sql, options),
      authenticate: async () => {
        await runQuery(pool, 'SELECT 1');
        return true;
      },
      close: async () => {},
    },
    models: {},
  };
}

async function closeAll() {
  closed = true;
  const closers = [];
  for (const p of pools.values()) {
    try {
      closers.push(p.end());
    } catch {
      // ignore close errors
    }
  }
  pools.clear();
  await Promise.allSettled(closers);
}

module.exports = { getTenantConnection, closeAll };
