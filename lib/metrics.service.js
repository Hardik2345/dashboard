const { QueryTypes } = require('sequelize');

// Build inclusive WHERE for raw SQL
function buildWhereClause(start, end) {
  const parts = [];
  const params = [];
  if (start) {
    parts.push("date >= ?");
    params.push(start);
  }
  if (end) {
    parts.push("date <= ?");
    params.push(end);
  }
  const where = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
  return { where, params };
}

// raw SUM helper to avoid ORM coercion issues
async function rawSum(column, { start, end, conn }) {
  const { where, params } = buildWhereClause(start, end);
  const sql = `SELECT COALESCE(SUM(${column}), 0) AS total FROM overall_summary ${where}`;
  const rows = await conn.query(sql, { type: QueryTypes.SELECT, replacements: params });
  return Number(rows[0]?.total || 0);
}

async function computeTotalSales({ start, end, conn }) { return rawSum('total_sales', { start, end, conn }); }
async function computeTotalOrders({ start, end, conn }) { return rawSum('total_orders', { start, end, conn }); }

async function computeFunnelStats({ start, end, conn }) {
  const [total_sessions, total_atc_sessions, total_orders] = await Promise.all([
    rawSum('total_sessions', { start, end, conn }),
    rawSum('total_atc_sessions', { start, end, conn }),
    rawSum('total_orders', { start, end, conn }),
  ]);
  return { total_sessions, total_atc_sessions, total_orders };
}

// AOV = SUM(total_sales) / SUM(total_orders)
async function computeAOV({ start, end, conn }) {
  const total_sales = await rawSum('total_sales', { start, end, conn });
  const total_orders = await rawSum('total_orders', { start, end, conn });
  const aov = total_orders > 0 ? total_sales / total_orders : 0;
  return { total_sales, total_orders, aov };
}

// CVR = SUM(total_orders) / SUM(total_sessions)
async function computeCVR({ start, end, conn }) {
  const total_orders = await rawSum('total_orders', { start, end, conn });
  const total_sessions = await rawSum('total_sessions', { start, end, conn });
  const cvr = total_sessions > 0 ? total_orders / total_sessions : 0;
  return { total_orders, total_sessions, cvr, cvr_percent: cvr * 100 };
}

module.exports = {
  buildWhereClause,
  rawSum,
  computeTotalSales,
  computeTotalOrders,
  computeFunnelStats,
  computeAOV,
  computeCVR,
};
