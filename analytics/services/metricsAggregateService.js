const { QueryTypes } = require("sequelize");
const {
  appendUtmWhere,
} = require("../shared/utils/filters");

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

function hasDiscountFilter(filters = {}) {
  return !!(filters.discount_code || "").toString().trim();
}

function normalizeDiscountCode(filters = {}) {
  return (filters.discount_code || "").toString().trim();
}

function resolveDiscountAggregateSource(filters = {}, granularity = "daily") {
  if (filters.city && (!Array.isArray(filters.city) || filters.city.length > 0)) {
    return null;
  }
  const discountCode = normalizeDiscountCode(filters);
  if (!discountCode) return null;
  return {
    table:
      granularity === "hourly"
        ? "dashboard_discount_hourly"
        : "dashboard_discount_daily",
    filters: { discount_code: discountCode },
  };
}

function appendDiscountWhere(sql, replacements, filters = {}) {
  const discountCode = normalizeDiscountCode(filters);
  if (!discountCode) return sql;
  replacements.push(discountCode);
  return `${sql} AND discount_code = ?`;
}

function resolveUtmAggregateSource(filters = {}, granularity = "daily") {
  if (
    filters.utm_term ||
    filters.utm_content ||
    filters.sales_channel ||
    filters.device_type ||
    filters.product_id ||
    filters.city
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
      COALESCE(SUM(total_atc_sessions), 0) AS total_atc_sessions,
      (
        SELECT COALESCE(SUM(ci_events), 0)
        FROM hourly_sessions_summary_shopify
        WHERE date >= ? AND date <= ?
      ) AS total_ci_events
    FROM overall_summary
    WHERE date >= ? AND date <= ?
  `;
  const rows = await conn.query(sql, {
    type: QueryTypes.SELECT,
    replacements: [start, end, start, end],
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
      (
        SELECT COALESCE(SUM(ci_events), 0)
        FROM hourly_sessions_summary_shopify
        WHERE date >= ? AND date <= ?
      ) AS current_total_ci_events,
      COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN total_orders ELSE 0 END), 0) AS previous_total_orders,
      COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN total_sales ELSE 0 END), 0) AS previous_total_sales,
      COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN COALESCE(adjusted_total_sessions, total_sessions) ELSE 0 END), 0) AS previous_total_sessions,
      COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN total_atc_sessions ELSE 0 END), 0) AS previous_total_atc_sessions,
      (
        SELECT COALESCE(SUM(ci_events), 0)
        FROM hourly_sessions_summary_shopify
        WHERE date >= ? AND date <= ?
      ) AS previous_total_ci_events
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
      total_ci_events: Number(row.current_total_ci_events || 0),
    },
    previous: {
      total_orders: Number(row.previous_total_orders || 0),
      total_sales: Number(row.previous_total_sales || 0),
      total_sessions: Number(row.previous_total_sessions || 0),
      total_atc_sessions: Number(row.previous_total_atc_sessions || 0),
      total_ci_events: Number(row.previous_total_ci_events || 0),
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

  sql = appendUtmWhere(sql, replacements, filters, true);
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
  let rtoSql = `
    SELECT
      COUNT(DISTINCT rf.order_id) AS rto_orders
    FROM returns_fact rf
    JOIN shopify_orders so ON rf.order_id = so.order_id
    WHERE rf.event_type = 'CANCEL (RTO)'
      AND rf.order_created_date >= ? AND rf.order_created_date <= ?
  `;
  const rtoReplacements = [start, end];
  rtoSql = appendUtmWhere(rtoSql, rtoReplacements, filters, true);
  if (filters.product_id) {
    rtoSql += ` AND so.product_id = ?`;
    rtoReplacements.push(filters.product_id);
  }
  const [sessionRow] = await conn.query(sessionsSql, {
    type: QueryTypes.SELECT,
    replacements: sessionReplacements,
  });
  const [rtoRow] = await conn.query(rtoSql, {
    type: QueryTypes.SELECT,
    replacements: rtoReplacements,
  });

  return {
    total_sessions: Number(sessionRow?.total_sessions || 0),
    total_atc_sessions: Number(sessionRow?.total_atc_sessions || 0),
    total_orders: Number(orders.total_orders || 0),
    total_sales: Number(orders.total_sales || 0),
    rto_orders: Number(rtoRow?.rto_orders || 0),
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
  // Aggregate UTM tables already store canonical bucket values like literal
  // "direct", so they should be filtered by exact value instead of the
  // raw-table null/blank-aware direct mapping.
  sql = appendUtmWhere(sql, replacements, source.filters, false);

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

  // Aggregate UTM tables already store canonical bucket values like literal
  // "direct", so they should be filtered by exact value instead of the
  // raw-table null/blank-aware direct mapping.
  sql = appendUtmWhere(sql, replacements, source.filters, false);

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
    // Aggregate UTM tables already store canonical bucket values like literal
    // "direct", so they should be filtered by exact value instead of the
    // raw-table null/blank-aware direct mapping.
    sql = appendUtmWhere(sql, replacements, source.filters, false);
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
    // Aggregate UTM tables already store canonical bucket values like literal
    // "direct", so they should be filtered by exact value instead of the
    // raw-table null/blank-aware direct mapping.
    sql = appendUtmWhere(sql, replacements, source.filters, false);
    sql += ` GROUP BY metric_date ORDER BY metric_date ASC`;
  }

  return conn.query(sql, {
    type: QueryTypes.SELECT,
    replacements,
  });
}

function buildDiscountAggregateSelect(prefix, includeHour = false) {
  const dateClause = `date >= ? AND date <= ?`;
  const hourClause = includeHour ? ` AND hour <= ?` : "";
  const sql = `
    COALESCE(SUM(CASE WHEN ${dateClause}${hourClause} THEN total_orders ELSE 0 END), 0) AS ${prefix}_total_orders,
    COALESCE(SUM(CASE WHEN ${dateClause}${hourClause} THEN gross_revenue ELSE 0 END), 0) AS ${prefix}_total_sales
  `;
  return {
    sql,
    replacementsForRange(start, end, cutoffHour = null) {
      const replacements = [start, end];
      if (includeHour) replacements.push(cutoffHour);
      replacements.push(start, end);
      if (includeHour) replacements.push(cutoffHour);
      return replacements;
    },
  };
}

async function queryDiscountAggregateTotals(
  conn,
  start,
  end,
  filters = {},
  options = {},
) {
  const { granularity = "daily", cutoffHour = null } = options;
  const source = resolveDiscountAggregateSource(filters, granularity);
  if (!source) return null;

  let sql = `
    SELECT
      COALESCE(SUM(total_orders), 0) AS total_orders,
      COALESCE(SUM(gross_revenue), 0) AS total_sales
    FROM ${source.table}
    WHERE date >= ? AND date <= ?
  `;
  const replacements = [start, end];
  if (granularity === "hourly" && cutoffHour !== null && cutoffHour !== undefined) {
    sql += ` AND hour <= ?`;
    replacements.push(cutoffHour);
  }
  sql = appendDiscountWhere(sql, replacements, source.filters);

  const rows = await conn.query(sql, {
    type: QueryTypes.SELECT,
    replacements,
  });
  const row = rows?.[0] || {};
  return {
    total_orders: Number(row.total_orders || 0),
    total_sales: Number(row.total_sales || 0),
    total_sessions: null,
    total_atc_sessions: null,
    cancelled_orders: null,
    refunded_orders: null,
  };
}

async function queryDiscountAggregatePair(
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
  const source = resolveDiscountAggregateSource(filters, granularity);
  if (!source) return null;

  const combinedStart =
    currentRange.start <= previousRange.start
      ? currentRange.start
      : previousRange.start;
  const combinedEnd =
    currentRange.end >= previousRange.end
      ? currentRange.end
      : previousRange.end;

  const includeHour = granularity === "hourly";
  const currentSelect = buildDiscountAggregateSelect("current", includeHour);
  const previousSelect = buildDiscountAggregateSelect("previous", includeHour);
  let sql = `
    SELECT
      ${currentSelect.sql},
      ${previousSelect.sql}
    FROM ${source.table}
    WHERE date >= ? AND date <= ?
  `;
  const replacements = [
    ...currentSelect.replacementsForRange(
      currentRange.start,
      currentRange.end,
      currentCutoffHour,
    ),
    ...previousSelect.replacementsForRange(
      previousRange.start,
      previousRange.end,
      previousCutoffHour,
    ),
    combinedStart,
    combinedEnd,
  ];
  sql = appendDiscountWhere(sql, replacements, source.filters);

  const rows = await conn.query(sql, {
    type: QueryTypes.SELECT,
    replacements,
  });
  const row = rows?.[0] || {};
  return {
    current: {
      total_orders: Number(row.current_total_orders || 0),
      total_sales: Number(row.current_total_sales || 0),
      total_sessions: null,
      total_atc_sessions: null,
      cancelled_orders: null,
      refunded_orders: null,
    },
    previous: {
      total_orders: Number(row.previous_total_orders || 0),
      total_sales: Number(row.previous_total_sales || 0),
      total_sessions: null,
      total_atc_sessions: null,
      cancelled_orders: null,
      refunded_orders: null,
    },
  };
}

async function queryDiscountAggregateRows(
  conn,
  start,
  end,
  filters = {},
  options = {},
) {
  const { granularity = "daily", cutoffHour = null } = options;
  const source = resolveDiscountAggregateSource(filters, granularity);
  if (!source) return null;

  const replacements = [start, end];
  let sql;
  if (granularity === "hourly") {
    sql = `
      SELECT
        DATE_FORMAT(date, '%Y-%m-%d') AS date,
        hour,
        COALESCE(SUM(gross_revenue), 0) AS sales,
        COALESCE(SUM(total_orders), 0) AS orders,
        0 AS sessions,
        0 AS atc
      FROM ${source.table}
      WHERE date >= ? AND date <= ?
    `;
    if (cutoffHour !== null && cutoffHour !== undefined) {
      sql += ` AND hour <= ?`;
      replacements.push(cutoffHour);
    }
    sql = appendDiscountWhere(sql, replacements, source.filters);
    sql += ` GROUP BY date, hour ORDER BY date ASC, hour ASC`;
  } else {
    sql = `
      SELECT
        DATE_FORMAT(date, '%Y-%m-%d') AS date,
        COALESCE(SUM(gross_revenue), 0) AS sales,
        COALESCE(SUM(total_orders), 0) AS orders,
        0 AS sessions,
        0 AS atc
      FROM ${source.table}
      WHERE date >= ? AND date <= ?
    `;
    sql = appendDiscountWhere(sql, replacements, source.filters);
    sql += ` GROUP BY date ORDER BY date ASC`;
  }

  return conn.query(sql, {
    type: QueryTypes.SELECT,
    replacements,
  });
}

async function queryUtmSummaryFilterOptions(conn, start, end) {
  const [rows, discountRows, cityRows] = await Promise.all([
    conn.query(
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
  ),
    conn.query(
      `
        SELECT DISTINCT discount_code
        FROM dashboard_discount_daily
        WHERE date >= ? AND date <= ?
          AND discount_code IS NOT NULL
          AND discount_code <> ''
        ORDER BY discount_code
      `,
      {
        type: QueryTypes.SELECT,
        replacements: [start, end],
      },
    ),
    conn.query(
      `
        SELECT DISTINCT city
        FROM daily_citywise_summary
        WHERE date >= ? AND date <= ?
          AND city IS NOT NULL
          AND TRIM(city) <> ''
        ORDER BY city
      `,
      {
        type: QueryTypes.SELECT,
        replacements: [start, end],
      },
    ),
  ]);

  return {
    ...buildSummaryFilterOptions(rows),
    discount_codes: discountRows.map((row) => row.discount_code).filter(Boolean),
    city: cityRows.map((row) => row.city).filter(Boolean),
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
  appendDiscountWhere,
  hasDiscountFilter,
  resolveDiscountAggregateSource,
  resolveUtmAggregateSource,
  queryOverallSummaryTotals,
  queryOverallSummaryPair,
  queryOrderSalesTotals,
  queryUtmAggregateTotals,
  queryUtmAggregatePair,
  queryUtmAggregateRows,
  queryDiscountAggregateTotals,
  queryDiscountAggregatePair,
  queryDiscountAggregateRows,
  queryUtmSummaryFilterOptions,
  queryProductDailySessionTotals,
  queryProductKpiTotals,
  buildSummaryFilterOptions,
};
