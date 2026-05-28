const mysql = require('mysql2/promise');
const { recordMysqlConnectionError, captureError } = require('../observability');

const pools = new Map();

function getPool(config) {
  const key = `${config.host}:${config.port}:${config.user}:${config.database}`;
  if (pools.has(key)) return pools.get(key);

  const pool = mysql.createPool({
    host: config.host,
    port: config.port || 3306,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    ssl: { rejectUnauthorized: false }
  });
  pool.on('connection', (conn) => {
    conn.on('error', (err) => {
      recordMysqlConnectionError(config.database || 'unknown');
      captureError(err, null, {
        type: 'mysql_connection',
        brand: config.database || 'unknown',
      });
    });
  });

  pools.set(key, pool);
  return pool;
}

module.exports = { getPool };
