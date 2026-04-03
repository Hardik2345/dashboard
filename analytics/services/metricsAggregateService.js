const { QueryTypes } = require("sequelize");
const {
  appendUtmWhere,
} = require("../utils/metricsUtils");

function pickSupportedUtmFilters(filters = {}) {
  return {
    utm_source: filters.utm_source || null,
    utm_medium: filters.utm_medium || null,
    utm_campaign: filters.utm_campaign || null,
  };
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return !!value;
}

function resolveUtmAggregateSource(filters = {}, granularity = "daily") {
  if (
    filters.utm_term ||
    filters.utm_content ||
    filters.sales_channel ||
    filters.device_type ||
    filters.product_id
  ) {
    return null;
  }

  const supported = pickSupportedUtmFilters(filters);
  const hasSource = hasValue(supported.utm_source);
  const hasMedium = hasValue(supported.utm_medium);
  const hasCampaign = hasValue(supported.utm_campaign);

  if (!hasSource && !hasMedium && !hasCampaign) {
    return null;
  }

  const suffix = granularity === "hourly" ? "hourly" : "daily";
  if (hasSource && hasMedium && hasCampaign) {
    return {
      table: `utm_source_medium_campaign_${suffix}`,
      filters: supported,
    };
  }
  if (hasSource && hasMedium) {
    return {
      table: `utm_source_medium_${suffix}`,
      filters: supported,
    };
  }
  if (hasSource && hasCampaign) {
    return {
      table: `utm_source_campaign_${suffix}`,
      filters: supported,
    };
  }
  if (hasMedium && hasCampaign) {
    return {
      table: `utm_medium_campaign_${suffix}`,
      filters: supported,
    };
  }
  if (hasSource) {
    return {
      table: `utm_source_${suffix}`,
      filters: supported,
    };
  }
  if (hasMedium) {
    return {
      table: `utm_medium_${suffix}`,
      filters: supported,
    };
  }
  return {
    table: `utm_campaign_${suffix}`,
    filters: supported,
  };
}

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

async function queryOverallSummaryPair(conn, currentRange, previousRange) {
  const combinedStart =
    currentRange.start <= previousRange.start
      ? currentRange.start
      : previousRange.start;
  const combinedEnd =
    currentRange.end >= previousRange.end
      ? currentRange.end
      : previousRange.end;

  const sql = `
    SELECT
      COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN total_orders ELSE 0 END), 0) AS current_total_orders,
      COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN total_sales ELSE 0 END), 0) AS current_total_sales,
      COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN COALESCE(adjusted_total_sessions, total_sessions) ELSE 0 END), 0) AS current_total_sessions,
      COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN total_atc_sessions ELSE 0 END), 0) AS current_total_atc_sessions,
      COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN total_orders ELSE 0 END), 0) AS previous_total_orders,
      COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN total_sales ELSE 0 END), 0) AS previous_total_sales,
      COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN COALESCE(adjusted_total_sessions, total_sessions) ELSE 0 END), 0) AS previous_total_sessions,
      COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN total_atc_sessions ELSE 0 END), 0) AS previous_total_atc_sessions
    FROM overall_summary
    WHERE date >= ? AND date <= ?
  `;
  const rows = await conn.query(sql, {
    type: QueryTypes.SELECT,
    replacements: [
      currentRange.start,
      currentRange.end,
      currentRange.start,
      currentRange.end,
      currentRange.start,
      currentRange.end,
      currentRange.start,
      currentRange.end,
      previousRange.start,
      previousRange.end,
      previousRange.start,
      previousRange.end,
      previousRange.start,
      previousRange.end,
      previousRange.start,
      previousRange.end,
      combinedStart,
      combinedEnd,
    ],
  });
  const row = rows?.[0] || {};
  return {
    current: {
      total_orders: Number(row.current_total_orders || 0),
      total_sales: Number(row.current_total_sales || 0),
      total_sessions: Number(row.current_total_sessions || 0),
      total_atc_sessions: Number(row.current_total_atc_sessions || 0),
    },
    previous: {
      total_orders: Number(row.previous_total_orders || 0),
      total_sales: Number(row.previous_total_sales || 0),
      total_sessions: Number(row.previous_total_sessions || 0),
      total_atc_sessions: Number(row.previous_total_atc_sessions || 0),
    },
  };
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

function buildUtmAggregateSelect(prefix, includeHour = false) {
  const dateClause = `metric_date >= ? AND metric_date <= ?`;
  const hourClause = includeHour ? ` AND metric_hour <= ?` : "";
  const sql = `
    COALESCE(SUM(CASE WHEN ${dateClause}${hourClause} THEN orders ELSE 0 END), 0) AS ${prefix}_total_orders,
    COALESCE(SUM(CASE WHEN ${dateClause}${hourClause} THEN sales ELSE 0 END), 0) AS ${prefix}_total_sales,
    COALESCE(SUM(CASE WHEN ${dateClause}${hourClause} THEN sessions ELSE 0 END), 0) AS ${prefix}_total_sessions,
    COALESCE(SUM(CASE WHEN ${dateClause}${hourClause} THEN atc_sessions ELSE 0 END), 0) AS ${prefix}_total_atc_sessions,
    COALESCE(SUM(CASE WHEN ${dateClause}${hourClause} THEN cancelled_orders ELSE 0 END), 0) AS ${prefix}_cancelled_orders,
    COALESCE(SUM(CASE WHEN ${dateClause}${hourClause} THEN refunded_orders ELSE 0 END), 0) AS ${prefix}_refunded_orders
  `;
  return {
    sql,
    replacementsForRange(start, end, cutoffHour = null) {
      const replacements = [];
      for (let i = 0; i < 6; i += 1) {
        replacements.push(start, end);
        if (includeHour) {
          replacements.push(cutoffHour);
        }
      }
      return replacements;
    },
  };
}

async function queryUtmAggregateTotals(
  conn,
  start,
  end,
  filters = {},
  options = {},
) {
  const { granularity = "daily", cutoffHour = null } = options;
  const source = resolveUtmAggregateSource(filters, granularity);
  if (!source) {
    return null;
  }

  let sql = `
    SELECT
      COALESCE(SUM(orders), 0) AS total_orders,
      COALESCE(SUM(sales), 0) AS total_sales,
      COALESCE(SUM(sessions), 0) AS total_sessions,
      COALESCE(SUM(atc_sessions), 0) AS total_atc_sessions,
      COALESCE(SUM(cancelled_orders), 0) AS cancelled_orders,
      COALESCE(SUM(refunded_orders), 0) AS refunded_orders
    FROM ${source.table}
    WHERE metric_date >= ? AND metric_date <= ?
  `;
  const replacements = [start, end];
  if (granularity === "hourly" && cutoffHour !== null && cutoffHour !== undefined) {
    sql += ` AND metric_hour <= ?`;
    replacements.push(cutoffHour);
  }
  sql = appendUtmWhere(sql, replacements, source.filters, true);

  const rows = await conn.query(sql, {
    type: QueryTypes.SELECT,
    replacements,
  });
  const row = rows?.[0] || {};
  return {
    total_orders: Number(row.total_orders || 0),
    total_sales: Number(row.total_sales || 0),
    total_sessions: Number(row.total_sessions || 0),
    total_atc_sessions: Number(row.total_atc_sessions || 0),
    cancelled_orders: Number(row.cancelled_orders || 0),
    refunded_orders: Number(row.refunded_orders || 0),
  };
}

async function queryUtmAggregatePair(
  conn,
  currentRange,
  previousRange,
  filters = {},
  options = {},
) {
  const {
    granularity = "daily",
    currentCutoffHour = null,
    previousCutoffHour = null,
  } = options;
  const source = resolveUtmAggregateSource(filters, granularity);
  if (!source) {
    return null;
  }

  const combinedStart =
    currentRange.start <= previousRange.start
      ? currentRange.start
      : previousRange.start;
  const combinedEnd =
    currentRange.end >= previousRange.end
      ? currentRange.end
      : previousRange.end;

  const includeHour = granularity === "hourly";
  const selectBuilder = buildUtmAggregateSelect("current", includeHour);
  const previousSelectBuilder = buildUtmAggregateSelect("previous", includeHour);

  let sql = `
    SELECT
      ${selectBuilder.sql},
      ${previousSelectBuilder.sql}
    FROM ${source.table}
    WHERE metric_date >= ? AND metric_date <= ?
  `;
  const replacements = [
    ...selectBuilder.replacementsForRange(
      currentRange.start,
      currentRange.end,
      currentCutoffHour,
    ),
    ...previousSelectBuilder.replacementsForRange(
      previousRange.start,
      previousRange.end,
      previousCutoffHour,
    ),
    combinedStart,
    combinedEnd,
  ];

  sql = appendUtmWhere(sql, replacements, source.filters, true);

  const rows = await conn.query(sql, {
    type: QueryTypes.SELECT,
    replacements,
  });
  const row = rows?.[0] || {};
  return {
    current: {
      total_orders: Number(row.current_total_orders || 0),
      total_sales: Number(row.current_total_sales || 0),
      total_sessions: Number(row.current_total_sessions || 0),
      total_atc_sessions: Number(row.current_total_atc_sessions || 0),
      cancelled_orders: Number(row.current_cancelled_orders || 0),
      refunded_orders: Number(row.current_refunded_orders || 0),
    },
    previous: {
      total_orders: Number(row.previous_total_orders || 0),
      total_sales: Number(row.previous_total_sales || 0),
      total_sessions: Number(row.previous_total_sessions || 0),
      total_atc_sessions: Number(row.previous_total_atc_sessions || 0),
      cancelled_orders: Number(row.previous_cancelled_orders || 0),
      refunded_orders: Number(row.previous_refunded_orders || 0),
    },
  };
}

async function queryUtmAggregateRows(
  conn,
  start,
  end,
  filters = {},
  options = {},
) {
  const { granularity = "daily", cutoffHour = null } = options;
  const source = resolveUtmAggregateSource(filters, granularity);
  if (!source) {
    return null;
  }

  let sql;
  const replacements = [start, end];
  if (granularity === "hourly") {
    sql = `
      SELECT
        DATE_FORMAT(metric_date, '%Y-%m-%d') AS date,
        metric_hour AS hour,
        COALESCE(SUM(sales), 0) AS sales,
        COALESCE(SUM(orders), 0) AS orders,
        COALESCE(SUM(sessions), 0) AS sessions,
        COALESCE(SUM(atc_sessions), 0) AS atc
      FROM ${source.table}
      WHERE metric_date >= ? AND metric_date <= ?
    `;
    if (cutoffHour !== null && cutoffHour !== undefined) {
      sql += ` AND metric_hour <= ?`;
      replacements.push(cutoffHour);
    }
    sql = appendUtmWhere(sql, replacements, source.filters, true);
    sql += ` GROUP BY metric_date, metric_hour ORDER BY metric_date ASC, metric_hour ASC`;
  } else {
    sql = `
      SELECT
        DATE_FORMAT(metric_date, '%Y-%m-%d') AS date,
        COALESCE(SUM(sales), 0) AS sales,
        COALESCE(SUM(orders), 0) AS orders,
        COALESCE(SUM(sessions), 0) AS sessions,
        COALESCE(SUM(atc_sessions), 0) AS atc
      FROM ${source.table}
      WHERE metric_date >= ? AND metric_date <= ?
    `;
    sql = appendUtmWhere(sql, replacements, source.filters, true);
    sql += ` GROUP BY metric_date ORDER BY metric_date ASC`;
  }

  return conn.query(sql, {
    type: QueryTypes.SELECT,
    replacements,
  });
}

async function queryUtmSummaryFilterOptions(conn, start, end) {
  const rows = await conn.query(
    `
      SELECT DISTINCT
        utm_source,
        utm_medium,
        utm_campaign
      FROM utm_source_medium_campaign_daily
      WHERE metric_date >= ? AND metric_date <= ?
      ORDER BY utm_source, utm_medium, utm_campaign
    `,
    {
      type: QueryTypes.SELECT,
      replacements: [start, end],
    },
  );

  return buildSummaryFilterOptions(rows);
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
  resolveUtmAggregateSource,
  queryOverallSummaryTotals,
  queryOverallSummaryPair,
  queryOrderSalesTotals,
  queryUtmAggregateTotals,
  queryUtmAggregatePair,
  queryUtmAggregateRows,
  queryUtmSummaryFilterOptions,
  queryProductDailySessionTotals,
  queryProductKpiTotals,
  buildSummaryFilterOptions,
};
