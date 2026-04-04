// Metrics computation helpers.
// Canonical location. Extracted from utils/metricsUtils.js.
// Also provides the single authoritative appendProductFilter, de-duped from
// metricsAggregateService.js and metricsSnapshotService.js.

const { QueryTypes } = require("sequelize");
const { buildWhereClause } = require("./sql");
const { buildUtmWhereClause, hasUtmFilters } = require("./filters");

// ── Aggregate helpers ──────────────────────────────────────────────────────────

async function rawSum(column, { start, end, conn }) {
  const { where, params } = buildWhereClause(start, end);
  const selectExpr =
    column === "total_sessions"
      ? "COALESCE(adjusted_total_sessions, total_sessions)"
      : column;
  const sql = `SELECT COALESCE(SUM(${selectExpr}), 0) AS total FROM overall_summary ${where}`;
  const rows = await conn.query(sql, { type: QueryTypes.SELECT, replacements: params });
  return Number(rows[0]?.total || 0);
}

async function computeReturnCounts({ start, end, conn, filters }) {
  const parts = [];
  const params = [];

  if (hasUtmFilters(filters)) {
    let sql = `
      SELECT
        SUM(CASE WHEN rf.event_type = 'CANCEL' THEN 1 ELSE 0 END) AS cancelled_orders,
        SUM(CASE WHEN rf.event_type = 'REFUND'  THEN 1 ELSE 0 END) AS refunded_orders
      FROM returns_fact rf
      JOIN shopify_orders so ON rf.order_id = so.order_id
    `;
    if (start) { parts.push("rf.event_date >= ?"); params.push(start); }
    if (end)   { parts.push("rf.event_date <= ?"); params.push(end); }
    if (filters) {
      const built = buildUtmWhereClause(filters, { deviceColumn: "so.user_agent" });
      if (built.clause) { parts.push(built.clause); params.push(...built.params); }
    }
    sql += parts.length ? ` WHERE ${parts.join(" AND ")}` : "";
    const rows = await conn.query(sql, { type: QueryTypes.SELECT, replacements: params });
    return {
      cancelled_orders: Number(rows[0]?.cancelled_orders || 0),
      refunded_orders: Number(rows[0]?.refunded_orders || 0),
    };
  }

  let sql = `
    SELECT
      SUM(CASE WHEN event_type = 'CANCEL' THEN 1 ELSE 0 END) AS cancelled_orders,
      SUM(CASE WHEN event_type = 'REFUND'  THEN 1 ELSE 0 END) AS refunded_orders
    FROM returns_fact
  `;
  if (start) { parts.push("event_date >= ?"); params.push(start); }
  if (end)   { parts.push("event_date <= ?"); params.push(end); }
  sql += parts.length ? ` WHERE ${parts.join(" AND ")}` : "";
  const rows = await conn.query(sql, { type: QueryTypes.SELECT, replacements: params });
  return {
    cancelled_orders: Number(rows[0]?.cancelled_orders || 0),
    refunded_orders: Number(rows[0]?.refunded_orders || 0),
  };
}

function computePercentDelta(currentValue, previousValue) {
  const curr = Number(currentValue || 0);
  const prev = Number(previousValue || 0);
  const diff_pp = curr - prev;
  const diff_pct = prev > 0 ? (diff_pp / prev) * 100 : curr > 0 ? 100 : 0;
  const direction = diff_pp > 0.0001 ? "up" : diff_pp < -0.0001 ? "down" : "flat";
  return { diff_pp, diff_pct, direction };
}

// ── De-duped from metricsAggregateService + metricsSnapshotService ─────────────

function appendProductFilter(sql, replacements, productId, column = "product_id") {
  if (!productId) return sql;
  if (Array.isArray(productId)) {
    sql += ` AND ${column} IN (?)`;
    replacements.push(productId);
    return sql;
  }
  sql += ` AND ${column} = ?`;
  replacements.push(productId);
  return sql;
}

module.exports = {
  rawSum,
  computeReturnCounts,
  computePercentDelta,
  appendProductFilter,
};
