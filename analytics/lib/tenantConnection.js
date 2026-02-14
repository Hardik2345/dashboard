const mysql = require('mysql2/promise');
const mysqlCore = require('mysql2');
const { QueryTypes } = require('sequelize');

const POOL_MAX = Number(process.env.BRAND_POOL_MAX || 5);
const POOL_IDLE = Number(process.env.BRAND_POOL_IDLE || 600_000);
const POOL_MIN = Number(process.env.BRAND_POOL_MIN || 1);

const pools = new Map(); // key host:port:user
let closed = false;

function poolKey({ host, port, user }) {
  return `${host}:${port || 3306}:${user || ''}`;
}

function formatSql(sql, replacements) {
  if (!replacements) return sql;
  return mysqlCore.format(sql, replacements);
}

function ensurePool(route) {
  if (closed) throw new Error('tenant pools closed');
  const key = poolKey(route);
  if (pools.has(key)) return pools.get(key);

  const pool = mysql.createPool({
    host: route.host,
    port: route.port || 3306,
    user: route.user,
    password: route.password,
    // Do not bind to a specific database; switch per-request.
    waitForConnections: true,
    connectionLimit: POOL_MAX,
    maxIdle: POOL_MIN,
    idleTimeout: POOL_IDLE,
    queueLimit: 0,
    enableKeepAlive: true,
    // Align with IST to match legacy behaviour
    timezone: '+05:30',
    ssl: { rejectUnauthorized: false },
  });

  pools.set(key, pool);
  return pool;
}

async function runQuery(pool, route, sql, options = {}) {
  const conn = await pool.getConnection();
  try {
    // Ensure session timezone is set once per connection so DATETIME rows come back in IST
    if (!conn.__tzSet) {
      try {
        await conn.query("SET time_zone = '+05:30'");
      } catch {
        // ignore; fall back to driver-level timezone if SET fails
      }
      conn.__tzSet = true;
    }
    if (route.dbName) {
      await conn.query('USE ??', [route.dbName]);
    }
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
  return {
    key: route.brandId,
    dbName: route.dbName,
    sequelize: {
      query: (sql, options = {}) => runQuery(pool, route, sql, options),
      authenticate: async () => {
        await runQuery(pool, route, 'SELECT 1');
        return true;
      },
      close: async () => {},
    },
    models: {},
  };
}

async function closeAllTenantConnections() {
  closed = true;
  const closers = [];
  for (const p of pools.values()) {
    try {
      closers.push(p.end());
    } catch {
      // ignore
    }
  }
  pools.clear();
  await Promise.allSettled(closers);
}

module.exports = { getTenantConnection, closeAllTenantConnections };
