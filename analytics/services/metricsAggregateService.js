const { QueryTypes } = require("sequelize");
const {
  appendUtmWhere,
} = require("../utils/metricsUtils");

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

async function queryOverallSummaryTotals(conn, start, end) {
  const sql = `
    SELECT
      COALESCE(SUM(total_orders), 0) AS total_orders,
      COALESCE(SUM(total_sales), 0) AS total_sales,
      COALESCE(SUM(COALESCE(adjusted_total_sessions, total_sessions)), 0) AS total_sessions,
      COALESCE(SUM(total_atc_sessions), 0) AS total_atc_sessions
    FROM overall_summary
    WHERE date >= ? AND date <= ?
  `;
  const rows = await conn.query(sql, {
    type: QueryTypes.SELECT,
    replacements: [start, end],
  });
  return rows?.[0] || {};
}

async function queryOrderSalesTotals(
  conn,
  start,
  end,
  filters = {},
  cutoffTime = null,
) {
  const salesExpr = filters.product_id
    ? `COALESCE(SUM((line_item_price - COALESCE(discount_amount_per_line_item, 0)) * line_item_quantity), 0)`
    : `COALESCE(SUM(total_price), 0)`;

  let sql = `
    SELECT
      COUNT(DISTINCT order_name) AS total_orders,
      ${salesExpr} AS total_sales
    FROM shopify_orders
    WHERE created_date >= ? AND created_date <= ?
  `;
  const replacements = [start, end];
  if (cutoffTime) {
    sql += ` AND created_time < ?`;
    replacements.push(cutoffTime);
  }

  sql = appendUtmWhere(sql, replacements, filters);
  sql = appendProductFilter(sql, replacements, filters.product_id);

  const rows = await conn.query(sql, {
    type: QueryTypes.SELECT,
    replacements,
  });
  return rows?.[0] || {};
}

async function queryProductDailySessionTotals(conn, start, end, filters = {}) {
  let sql = `
    SELECT
      COALESCE(SUM(sessions), 0) AS total_sessions,
      COALESCE(SUM(sessions_with_cart_additions), 0) AS total_atc_sessions
    FROM mv_product_sessions_by_path_daily
    WHERE date >= ? AND date <= ?
  `;
  const replacements = [start, end];
  sql = appendProductFilter(sql, replacements, filters.product_id);
  const rows = await conn.query(sql, {
    type: QueryTypes.SELECT,
    replacements,
  });
  return rows?.[0] || {};
}

async function queryProductKpiTotals({ conn, start, end, filters = {} }) {
  let sessionsSql = `
    SELECT
      SUM(sessions) AS total_sessions,
      SUM(sessions_with_cart_additions) AS total_atc_sessions
    FROM mv_product_sessions_by_path_daily
    WHERE date >= ? AND date <= ?
  `;
  const sessionReplacements = [start, end];
  sessionsSql = appendProductFilter(
    sessionsSql,
    sessionReplacements,
    filters.product_id,
  );

  const orders = await queryOrderSalesTotals(conn, start, end, filters);
  const [sessionRow] = await conn.query(sessionsSql, {
    type: QueryTypes.SELECT,
    replacements: sessionReplacements,
  });

  return {
    total_sessions: Number(sessionRow?.total_sessions || 0),
    total_atc_sessions: Number(sessionRow?.total_atc_sessions || 0),
    total_orders: Number(orders.total_orders || 0),
    total_sales: Number(orders.total_sales || 0),
  };
}

function buildSummaryFilterOptions(rows = []) {
  const salesChannels = [];
  const seenChannels = new Set();
  const utmTree = {};

  for (const row of rows) {
    const channel = row.order_app_name;
    if (channel && !seenChannels.has(channel)) {
      seenChannels.add(channel);
      salesChannels.push(channel);
    }

    const {
      utm_source: source,
      utm_medium: medium,
      utm_campaign: campaign,
      utm_term: term,
      utm_content: content,
    } = row;

    if (!source) continue;
    if (!utmTree[source]) utmTree[source] = { mediums: {} };
    if (!medium) continue;
    if (!utmTree[source].mediums[medium]) {
      utmTree[source].mediums[medium] = { campaigns: {} };
    }
    if (!campaign) continue;
    if (!utmTree[source].mediums[medium].campaigns[campaign]) {
      utmTree[source].mediums[medium].campaigns[campaign] = {
        terms: [],
        contents: [],
      };
    }
    if (
      term &&
      !utmTree[source].mediums[medium].campaigns[campaign].terms.includes(term)
    ) {
      utmTree[source].mediums[medium].campaigns[campaign].terms.push(term);
    }
    if (
      content &&
      !utmTree[source].mediums[medium].campaigns[campaign].contents.includes(
        content,
      )
    ) {
      utmTree[source].mediums[medium].campaigns[campaign].contents.push(
        content,
      );
    }
  }

  return {
    sales_channel: salesChannels,
    utm_tree: utmTree,
  };
}

module.exports = {
  appendProductFilter,
  queryOverallSummaryTotals,
  queryOrderSalesTotals,
  queryProductDailySessionTotals,
  queryProductKpiTotals,
  buildSummaryFilterOptions,
};
