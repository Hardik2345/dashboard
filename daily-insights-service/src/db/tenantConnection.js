// Trimmed port of analytics/shared/db/tenantConnection.js — same pooling and
// dateStrings/timezone settings, which are what keep DATE columns as plain
// "YYYY-MM-DD" strings end-to-end (no UTC shift).

const mysql = require("mysql2/promise");
const mysqlCore = require("mysql2");

const POOL_MAX = Number(process.env.BRAND_POOL_MAX || 5);
const POOL_IDLE = Number(process.env.BRAND_POOL_IDLE || 600_000);
const POOL_MIN = Number(process.env.BRAND_POOL_MIN || 1);

const pools = new Map();

function poolKey({ host, port, user }) {
  return `${host}:${port || 3306}:${user || ""}`;
}

function formatSql(sql, replacements) {
  if (!replacements) return sql;
  return mysqlCore.format(sql, replacements);
}

function ensurePool(route) {
  const key = poolKey(route);
  if (pools.has(key)) return pools.get(key);

  const pool = mysql.createPool({
    host: route.host,
    port: route.port || 3306,
    user: route.user,
    password: route.password,
    waitForConnections: true,
    connectionLimit: POOL_MAX,
    maxIdle: POOL_MIN,
    idleTimeout: POOL_IDLE,
    queueLimit: 0,
    enableKeepAlive: true,
    timezone: "Z",
    dateStrings: true,
    ssl: { rejectUnauthorized: false },
  });

  pools.set(key, pool);
  return pool;
}

async function runQuery(pool, route, sql, options = {}) {
  const conn = await pool.getConnection();
  try {
    if (route.dbName) {
      await conn.query("USE ??", [route.dbName]);
    }
    const finalSql = options.replacements ? formatSql(sql, options.replacements) : sql;
    const [rows] = await conn.query(finalSql);
    return rows;
  } finally {
    conn.release();
  }
}

function getTenantConnection(route) {
  const pool = ensurePool(route);
  return {
    key: route.brandId,
    dbName: route.dbName,
    query: (sql, options = {}) => runQuery(pool, route, sql, options),
  };
}

module.exports = { getTenantConnection };
