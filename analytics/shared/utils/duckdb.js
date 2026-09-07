/**
 * DuckDB Query Service for Hourly Product Sessions
 *
 * Provides a unified query layer that reads:
 *   - Hot data (recent, within retention window) from MySQL
 *   - Cold data (archived beyond retention) from S3 Parquet via DuckDB
 *
 * Canonical location. Moved from services/duckdbQueryService.js
 *
 * Env vars:
 *   AWS_REGION, AWS_ACCESS_KEY_ID (or AWS_ACCESS_KEY), AWS_SECRET_ACCESS_KEY (or AWS_SECRET)
 *   AWS_S3_BUCKET                          — bucket containing archived Parquet
 *   HOURLY_PRODUCT_SESSIONS_S3_PREFIX      — default: hourly-product-sessions
 *   HOURLY_PRODUCT_SESSIONS_RETENTION_DAYS — default: 7
 */

const duckdb = require("duckdb");

// ---------- Singleton DuckDB instance ----------

let _db = null;
let _conn = null;
let _httpfsLoaded = false;

function getDb() {
  if (!_db) {
    _db = new duckdb.Database(":memory:");
  }
  return _db;
}

function getConn() {
  if (!_conn) {
    _conn = getDb().connect();
  }
  return _conn;
}

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    const conn = getConn();
    if (params.length > 0) {
      const stmt = conn.prepare(sql, (err) => {
        if (err) return reject(err);
        stmt.all(...params, (err2, rows) => {
          if (err2) return reject(err2);
          resolve(rows);
        });
        stmt.finalize();
      });
    } else {
      conn.all(sql, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    }
  });
}

function runExec(sql) {
  return new Promise((resolve, reject) => {
    const conn = getConn();
    conn.exec(sql, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function ensureHttpfs() {
  if (_httpfsLoaded) return;

  const region = process.env.AWS_REGION || "ap-south-1";
  const accessKey = process.env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY || "";
  const secret = process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET || "";

  await runExec("INSTALL httpfs; LOAD httpfs;");
  await runExec(`SET s3_region = '${region}';`);
  await runExec(`SET s3_access_key_id = '${accessKey}';`);
  await runExec(`SET s3_secret_access_key = '${secret}';`);

  _httpfsLoaded = true;
}

// ---------- S3 path helpers ----------

function getS3Prefix() {
  return process.env.HOURLY_PRODUCT_SESSIONS_S3_PREFIX || "hourly-product-sessions";
}

function getRetentionDays() {
  return parseInt(process.env.HOURLY_PRODUCT_SESSIONS_RETENTION_DAYS || "7", 10);
}

function buildS3GlobForRange(bucket, brandKey, startDate, endDate) {
  const prefix = getS3Prefix();
  return `s3://${bucket}/${prefix}/${brandKey}/year=*/month=*/day=*/data.parquet`;
}

// ---------- Cold query (S3 via DuckDB) ----------

async function queryCold({ brandKey, startDate, endDate, filters = {} }) {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) return [];

  await ensureHttpfs();

  const s3Glob = buildS3GlobForRange(bucket, brandKey, startDate, endDate);
  const whereClauses = [`date >= '${startDate}' AND date <= '${endDate}'`];
  const filterKeys = [
    "product_id", "landing_page_path",
    "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
    "referrer_name",
  ];

  for (const key of filterKeys) {
    if (filters[key]) {
      whereClauses.push(`${key} = '${String(filters[key]).replace(/'/g, "''")}'`);
    }
  }
  if (filters.hour !== undefined && filters.hour !== null) {
    whereClauses.push(`hour = ${parseInt(filters.hour, 10)}`);
  }

  const sql = `
    SELECT *
    FROM read_parquet('${s3Glob}', hive_partitioning = true)
    WHERE ${whereClauses.join(" AND ")}
    ORDER BY date, hour, sessions DESC
  `;

  try {
    return await runQuery(sql);
  } catch (err) {
    if (err.message && err.message.includes("No files found")) return [];
    throw err;
  }
}

// ---------- Hot query (MySQL via Sequelize-like connection or mysql2 pool) ----------

async function queryHot(conn, { startDate, endDate, filters = {} }) {
  const conditions = ["date >= ? AND date <= ?"];
  const params = [startDate, endDate];
  const filterKeys = [
    "product_id", "landing_page_path",
    "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
    "referrer_name",
  ];

  for (const key of filterKeys) {
    if (filters[key]) {
      conditions.push(`${key} = ?`);
      params.push(filters[key]);
    }
  }
  if (filters.hour !== undefined && filters.hour !== null) {
    conditions.push(`hour = ?`);
    params.push(parseInt(filters.hour, 10));
  }

  const sql = `
    SELECT
      date, hour, landing_page_type, landing_page_path,
      product_id, product_title,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      referrer_name, sessions, sessions_with_cart_additions
    FROM hourly_product_sessions
    WHERE ${conditions.join(" AND ")}
    ORDER BY date, hour, sessions DESC
  `;

  if (conn.query && typeof conn.query === "function" && conn.getConnection) {
    const c = await conn.getConnection();
    try {
      const [rows] = await c.query(sql, params);
      return rows;
    } finally {
      c.release();
    }
  }
  return conn.query(sql, { replacements: params });
}

// ---------- Unified query ----------

/**
 * Query hourly product sessions across hot (MySQL) and cold (S3/DuckDB) storage.
 *
 * @param {object} opts
 * @param {string} opts.brandKey    — Brand tag (e.g. "PTS")
 * @param {object} opts.conn        — Sequelize-like connection or mysql2 pool for brand DB
 * @param {string} opts.startDate   — ISO date (YYYY-MM-DD)
 * @param {string} opts.endDate     — ISO date (YYYY-MM-DD)
 * @param {object} [opts.filters]   — Optional dimension filters
 * @returns {Promise<Array>}
 */
async function queryHourlyProductSessions({ brandKey, conn, startDate, endDate, filters = {} }) {
  const retentionDays = getRetentionDays();
  const cutoffStr = new Date(Date.now() - retentionDays * 86400000)
    .toISOString()
    .slice(0, 10);

  const needsCold = startDate < cutoffStr;
  const needsHot = endDate >= cutoffStr;
  let results = [];

  if (needsCold) {
    const coldEnd = endDate < cutoffStr ? endDate : cutoffStr;
    const coldRows = await queryCold({ brandKey, startDate, endDate: coldEnd, filters });
    results.push(...coldRows);
  }

  if (needsHot) {
    const hotStart = startDate >= cutoffStr ? startDate : cutoffStr;
    const hotRows = await queryHot(conn, { startDate: hotStart, endDate, filters });
    results.push(...hotRows);
  }

  return results;
}

/**
 * Write query results to S3 as Parquet using DuckDB's COPY command.
 * Used by the archive script.
 */
async function writeParquetToS3(rows, s3Path) {
  if (!rows.length) return;

  await ensureHttpfs();

  await runExec(`DROP TABLE IF EXISTS _archive_tmp`);
  await runExec(`
    CREATE TABLE _archive_tmp (
      date DATE,
      hour TINYINT,
      landing_page_type VARCHAR,
      landing_page_path VARCHAR,
      product_id VARCHAR,
      product_title VARCHAR,
      utm_source VARCHAR,
      utm_medium VARCHAR,
      utm_campaign VARCHAR,
      utm_content VARCHAR,
      utm_term VARCHAR,
      referrer_name VARCHAR,
      sessions INTEGER,
      sessions_with_cart_additions INTEGER
    )
  `);

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk
      .map(
        (r) =>
          `(${[
            `'${r.date}'`,
            r.hour,
            r.landing_page_type ? `'${String(r.landing_page_type).replace(/'/g, "''")}'` : "NULL",
            r.landing_page_path ? `'${String(r.landing_page_path).replace(/'/g, "''")}'` : "NULL",
            r.product_id ? `'${String(r.product_id).replace(/'/g, "''")}'` : "NULL",
            r.product_title ? `'${String(r.product_title).replace(/'/g, "''")}'` : "NULL",
            r.utm_source ? `'${String(r.utm_source).replace(/'/g, "''")}'` : "NULL",
            r.utm_medium ? `'${String(r.utm_medium).replace(/'/g, "''")}'` : "NULL",
            r.utm_campaign ? `'${String(r.utm_campaign).replace(/'/g, "''")}'` : "NULL",
            r.utm_content ? `'${String(r.utm_content).replace(/'/g, "''")}'` : "NULL",
            r.utm_term ? `'${String(r.utm_term).replace(/'/g, "''")}'` : "NULL",
            r.referrer_name ? `'${String(r.referrer_name).replace(/'/g, "''")}'` : "NULL",
            r.sessions || 0,
            r.sessions_with_cart_additions || 0,
          ].join(",")})`
      )
      .join(",\n");

    await runExec(`INSERT INTO _archive_tmp VALUES ${values}`);
  }

  await runExec(`COPY _archive_tmp TO '${s3Path}' (FORMAT PARQUET, COMPRESSION ZSTD)`);
  await runExec(`DROP TABLE IF EXISTS _archive_tmp`);
}

module.exports = {
  queryHourlyProductSessions,
  queryCold,
  queryHot,
  writeParquetToS3,
  getRetentionDays,
  getS3Prefix,
};
