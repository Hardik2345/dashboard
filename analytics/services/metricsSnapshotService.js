const { QueryTypes } = require("sequelize");
const { isoDate } = require("../validation/schemas");
const {
  computePercentDelta,
  computeReturnCounts,
  appendUtmWhere,
} = require("../utils/metricsUtils");
const {
  parseIsoDate,
  formatIsoDate,
  shiftDays,
} = require("../utils/dateUtils");
const {
  DAY_MS,
  pad2,
  getNowIst,
  getTodayIst,
  parseHourFromCutoff,
  resolveCompareRange,
  buildLiveCutoffContext,
  buildLegacyRowTwoCutoffs,
} = require("./metricsFoundation");
const {
  normalizeMetricRequest,
} = require("./metricsRequestNormalizer");
const {
  buildMetricsDeltaMethods,
} = require("./metricsLegacyDeltaService");

function hasAnyFilters(filters = {}) {
  return !!(
    filters.utm_source ||
    filters.utm_medium ||
    filters.utm_campaign ||
    filters.utm_term ||
    filters.utm_content ||
    filters.sales_channel ||
    filters.device_type ||
    filters.product_id
  );
}

function hasSnapshotFilters(filters = {}) {
  return !!(
    filters.utm_source ||
    filters.utm_medium ||
    filters.utm_campaign ||
    filters.utm_term ||
    filters.utm_content
  );
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

function buildCutoffContext(start, end, now = new Date()) {
  return buildLiveCutoffContext(start, end, now);
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

async function queryOrderSalesTotals(conn, start, end, filters = {}, cutoffTime = null) {
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

async function queryLegacyCurrentSessionTotals(
  conn,
  start,
  end,
  filters = {},
  cutoffHour = 23,
) {
  if (filters.device_type) {
    return queryDeviceHourlyTotals(conn, start, end, filters, cutoffHour);
  }
  if (filters.product_id || hasSnapshotFilters(filters)) {
    return queryHourlyProductSessionTotals(conn, start, end, cutoffHour, filters);
  }
  if (!hasAnyFilters(filters)) {
    const totals = await queryOverallSummaryTotals(conn, start, end);
    return {
      total_sessions: totals.total_sessions,
      total_atc_sessions: totals.total_atc_sessions,
    };
  }
  return queryHourlySessionTotals(conn, start, end, cutoffHour);
}

async function queryLegacyPreviousSessionTotals(
  conn,
  start,
  end,
  filters = {},
  cutoffHour = 23,
) {
  if (filters.device_type) {
    return queryDeviceHourlyTotals(conn, start, end, filters, cutoffHour);
  }
  if (filters.product_id || hasSnapshotFilters(filters)) {
    return queryHourlyProductSessionTotals(conn, start, end, cutoffHour, filters);
  }
  return queryHourlySessionTotals(conn, start, end, cutoffHour);
}

function buildSnapshotSessionFilters(filters = {}) {
  return {
    utm_source: filters.utm_source,
    utm_medium: filters.utm_medium,
    utm_campaign: filters.utm_campaign,
    utm_term: filters.utm_term,
    utm_content: filters.utm_content,
  };
}

function buildDeviceExpressions(deviceType) {
  const types = Array.isArray(deviceType) ? deviceType : [deviceType];
  const sessionCols = [];
  const atcCols = [];
  for (const rawType of types) {
    const lower = (rawType || "").toString().toLowerCase().trim();
    if (lower === "desktop") {
      sessionCols.push("COALESCE(desktop_sessions, 0)");
      atcCols.push("COALESCE(desktop_atc_sessions, 0)");
    } else if (lower === "mobile") {
      sessionCols.push("COALESCE(mobile_sessions, 0)", "COALESCE(tablet_sessions, 0)");
      atcCols.push(
        "COALESCE(mobile_atc_sessions, 0)",
        "COALESCE(tablet_atc_sessions, 0)",
      );
    } else if (lower === "others") {
      sessionCols.push("COALESCE(other_sessions, 0)");
      atcCols.push("COALESCE(other_atc_sessions, 0)");
    }
  }

  return {
    sessionExpr:
      sessionCols.length > 0
        ? sessionCols.join(" + ")
        : "COALESCE(adjusted_number_of_sessions, number_of_sessions)",
    atcExpr:
      atcCols.length > 0
        ? atcCols.join(" + ")
        : "COALESCE(number_of_atc_sessions, 0)",
  };
}

async function querySnapshotSessionTotals(conn, start, end, filters = {}) {
  let sql = `
    SELECT
      COALESCE(SUM(sessions), 0) AS total_sessions,
      COALESCE(SUM(sessions_with_cart_additions), 0) AS total_atc_sessions
    FROM product_sessions_snapshot
    WHERE date >= ? AND date <= ?
  `;
  const replacements = [start, end];
  sql = appendUtmWhere(sql, replacements, buildSnapshotSessionFilters(filters), true);
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

async function queryDeviceHourlyTotals(conn, start, end, filters = {}, cutoffHour = 23) {
  const { sessionExpr, atcExpr } = buildDeviceExpressions(filters.device_type);

  const sql = `
    SELECT
      COALESCE(SUM(${sessionExpr}), 0) AS total_sessions,
      COALESCE(SUM(${atcExpr}), 0) AS total_atc_sessions
    FROM hourly_sessions_summary_shopify
    WHERE date >= ? AND date <= ? AND hour <= ?
  `;
  const rows = await conn.query(sql, {
    type: QueryTypes.SELECT,
    replacements: [start, end, cutoffHour],
  });
  return rows?.[0] || {};
}

async function queryHourlySessionTotals(conn, start, end, cutoffHour = 23) {
  const sql = `
    SELECT
      COALESCE(SUM(COALESCE(adjusted_number_of_sessions, number_of_sessions)), 0) AS total_sessions,
      COALESCE(SUM(number_of_atc_sessions), 0) AS total_atc_sessions
    FROM hourly_sessions_summary_shopify
    WHERE date >= ? AND date <= ? AND hour <= ?
  `;
  const rows = await conn.query(sql, {
    type: QueryTypes.SELECT,
    replacements: [start, end, cutoffHour],
  });
  return rows?.[0] || {};
}

async function queryHourlyProductSessionTotals(conn, start, end, cutoffHour = 23, filters = {}) {
  let sql = `
    SELECT
      COALESCE(SUM(sessions), 0) AS total_sessions,
      COALESCE(SUM(sessions_with_cart_additions), 0) AS total_atc_sessions
    FROM hourly_product_sessions
    WHERE date >= ? AND date <= ? AND hour <= ?
  `;
  const replacements = [start, end, cutoffHour];
  sql = appendUtmWhere(sql, replacements, buildSnapshotSessionFilters(filters), true);
  sql = appendProductFilter(sql, replacements, filters.product_id);
  const rows = await conn.query(sql, {
    type: QueryTypes.SELECT,
    replacements,
  });
  return rows?.[0] || {};
}

async function getReturnsSnapshot(conn, start, end, filters = {}) {
  const rows = await computeReturnCounts({ start, end, conn, filters });
  return {
    cancelled_orders: Number(rows.cancelled_orders || 0),
    refunded_orders: Number(rows.refunded_orders || 0),
  };
}

function buildSnapshotPayload(metrics = {}, returnsObj = {}, source = "db") {
  const total_orders = Number(metrics.total_orders || 0);
  const total_sales = Number(metrics.total_sales || 0);
  const total_sessions = Number(metrics.total_sessions || 0);
  const total_atc_sessions = Number(metrics.total_atc_sessions || 0);
  const average_order_value = total_orders > 0 ? total_sales / total_orders : 0;
  const conversion_rate = total_sessions > 0 ? total_orders / total_sessions : 0;

  return {
    total_orders,
    total_sales,
    total_sessions,
    total_atc_sessions,
    average_order_value,
    conversion_rate,
    conversion_rate_percent: conversion_rate * 100,
    cancelled_orders: Number(returnsObj.cancelled_orders || 0),
    refunded_orders: Number(returnsObj.refunded_orders || 0),
    source,
  };
}

function buildCachedSnapshot(cachedData = {}, returnsObj = {}, source = "cache") {
  return {
    total_orders: Number(cachedData.total_orders || 0),
    total_sales: Number(cachedData.total_sales || 0),
    total_sessions: Number(cachedData.total_sessions || 0),
    total_atc_sessions: Number(cachedData.total_atc_sessions || 0),
    average_order_value: Number(cachedData.average_order_value || 0),
    conversion_rate: Number(cachedData.conversion_rate || 0) / 100,
    conversion_rate_percent: Number(cachedData.conversion_rate || 0),
    cancelled_orders: Number(returnsObj.cancelled_orders || 0),
    refunded_orders: Number(returnsObj.refunded_orders || 0),
    source,
  };
}

function buildMetricDelta(metric, currentValue, previousValue, deltaCurrent = currentValue, deltaPrevious = previousValue) {
  const diff = Number(currentValue || 0) - Number(previousValue || 0);
  const pct = computePercentDelta(Number(deltaCurrent || 0), Number(deltaPrevious || 0));
  return {
    metric,
    current: Number(currentValue || 0),
    previous: Number(previousValue || 0),
    diff_pct: pct.diff_pct,
    direction: pct.direction,
    diff,
  };
}

function buildSummaryMetric(currentValue, previousValue, deltaCurrent = currentValue, deltaPrevious = previousValue) {
  const diff = Number(currentValue || 0) - Number(previousValue || 0);
  const pct = computePercentDelta(Number(deltaCurrent || 0), Number(deltaPrevious || 0));
  return {
    value: Number(currentValue || 0),
    previous: Number(previousValue || 0),
    diff,
    diff_pct: pct.diff_pct,
    direction: pct.direction,
  };
}

async function getLegacyRowTwoSnapshots({
  conn,
  currentRange,
  previousRange,
  filters = {},
  cutoffCtx,
}) {
  if (!cutoffCtx?.includesToday) {
    return null;
  }

  const {
    currentCutoffHour,
    previousSessionCutoffHour,
    previousOrderCutoffTime,
  } = buildLegacyRowTwoCutoffs(cutoffCtx);

  const [currentOrders, currentSessions, previousOrders, previousSessions] =
    await Promise.all([
      queryOrderSalesTotals(
        conn,
        currentRange.start,
        currentRange.end,
        filters,
        cutoffCtx.cutoffTime,
      ),
      queryLegacyCurrentSessionTotals(
        conn,
        currentRange.start,
        currentRange.end,
        filters,
        currentCutoffHour,
      ),
      queryOrderSalesTotals(
        conn,
        previousRange.start,
        previousRange.end,
        filters,
        previousOrderCutoffTime,
      ),
      queryLegacyPreviousSessionTotals(
        conn,
        previousRange.start,
        previousRange.end,
        filters,
        previousSessionCutoffHour,
      ),
    ]);

  const currentTotalOrders = Number(currentOrders?.total_orders || 0);
  const currentTotalSessions = Number(currentSessions?.total_sessions || 0);
  const currentTotalAtcSessions = Number(currentSessions?.total_atc_sessions || 0);
  const previousTotalOrders = Number(previousOrders?.total_orders || 0);
  const previousTotalSessions = Number(previousSessions?.total_sessions || 0);
  const previousTotalAtcSessions = Number(previousSessions?.total_atc_sessions || 0);

  return {
    current: {
      total_orders: currentTotalOrders,
      total_sessions: currentTotalSessions,
      total_atc_sessions: currentTotalAtcSessions,
      conversion_rate_percent:
        currentTotalSessions > 0
          ? (currentTotalOrders / currentTotalSessions) * 100
          : 0,
    },
    previous: {
      total_orders: previousTotalOrders,
      total_sessions: previousTotalSessions,
      total_atc_sessions: previousTotalAtcSessions,
      conversion_rate_percent:
        previousTotalSessions > 0
          ? (previousTotalOrders / previousTotalSessions) * 100
          : 0,
    },
  };
}

function getComparableRange(start, end, compareStart, compareEnd) {
  return resolveCompareRange(start, end, compareStart, compareEnd);
}

function isCacheEligible(range, filters, cutoffTime) {
  return !!range.start &&
    !!range.end &&
    range.start === range.end &&
    !hasAnyFilters(filters) &&
    !cutoffTime;
}

function monthBucket(dateStr) {
  return `${dateStr.slice(0, 7)}-01`;
}

function buildSeriesBuckets(start, end) {
  const list = [];
  for (let ts = parseIsoDate(start).getTime(); ts <= parseIsoDate(end).getTime(); ts += DAY_MS) {
    list.push(formatIsoDate(new Date(ts)));
  }
  return list;
}

function buildMetricShape(metrics) {
  const sessions = Number(metrics.sessions || 0);
  const orders = Number(metrics.orders || 0);
  const atc = Number(metrics.atc || 0);
  const sales = Number(metrics.sales || 0);
  const cvrRatio = sessions > 0 ? orders / sessions : 0;
  return {
    sales,
    orders,
    sessions,
    adjusted_sessions: sessions,
    raw_sessions: sessions,
    atc,
    cvr_ratio: cvrRatio,
    cvr_percent: cvrRatio * 100,
  };
}

async function fetchHourlyRows(conn, start, end, filters = {}, cutoffHour = 23) {
  const hasProduct = !!filters.product_id;
  const hasDevice = !!filters.device_type;
  const hasSnapshot = hasSnapshotFilters(filters);
  const hasSalesChannel = !!filters.sales_channel;

  if (!hasProduct && !hasDevice && !hasSnapshot && !hasSalesChannel) {
    const sql = `
      SELECT
        DATE_FORMAT(date, '%Y-%m-%d') AS date,
        hour,
        total_sales AS sales,
        number_of_orders AS orders,
        COALESCE(adjusted_number_of_sessions, number_of_sessions) AS sessions,
        number_of_atc_sessions AS atc
      FROM hour_wise_sales
      WHERE date >= ? AND date <= ? AND hour <= ?
      ORDER BY date ASC, hour ASC
    `;
    return conn.query(sql, {
      type: QueryTypes.SELECT,
      replacements: [start, end, cutoffHour],
    });
  }

  let orderSql = `
    SELECT
      created_date AS date,
      HOUR(created_time) AS hour,
      COUNT(DISTINCT order_name) AS orders,
      ${filters.product_id ? `COALESCE(SUM((line_item_price - COALESCE(discount_amount_per_line_item, 0)) * line_item_quantity), 0)` : `COALESCE(SUM(total_price), 0)`} AS sales
    FROM shopify_orders
    WHERE created_date >= ? AND created_date <= ? AND HOUR(created_time) <= ?
  `;
  const orderReplacements = [start, end, cutoffHour];
  orderSql = appendUtmWhere(orderSql, orderReplacements, filters);
  orderSql = appendProductFilter(orderSql, orderReplacements, filters.product_id);
  orderSql += ` GROUP BY created_date, HOUR(created_time) ORDER BY created_date ASC, HOUR(created_time) ASC`;

  let sessionRowsPromise;
  if (hasProduct || hasSnapshot) {
    let sessionSql = `
      SELECT
        DATE_FORMAT(date, '%Y-%m-%d') AS date,
        hour,
        COALESCE(SUM(sessions), 0) AS sessions,
        COALESCE(SUM(sessions_with_cart_additions), 0) AS atc
      FROM hourly_product_sessions
      WHERE date >= ? AND date <= ? AND hour <= ?
    `;
    const sessionReplacements = [start, end, cutoffHour];
    sessionSql = appendUtmWhere(
      sessionSql,
      sessionReplacements,
      buildSnapshotSessionFilters(filters),
      true,
    );
    sessionSql = appendProductFilter(sessionSql, sessionReplacements, filters.product_id);
    sessionSql += ` GROUP BY date, hour ORDER BY date ASC, hour ASC`;
    sessionRowsPromise = conn.query(sessionSql, {
      type: QueryTypes.SELECT,
      replacements: sessionReplacements,
    });
  } else if (hasDevice) {
    const { sessionExpr, atcExpr } = buildDeviceExpressions(filters.device_type);
    const sessionSql = `
      SELECT
        DATE_FORMAT(date, '%Y-%m-%d') AS date,
        hour,
        (${sessionExpr}) AS sessions,
        (${atcExpr}) AS atc
      FROM hourly_sessions_summary_shopify
      WHERE date >= ? AND date <= ? AND hour <= ?
      ORDER BY date ASC, hour ASC
    `;
    sessionRowsPromise = conn.query(sessionSql, {
      type: QueryTypes.SELECT,
      replacements: [start, end, cutoffHour],
    });
  } else {
    const sessionSql = `
      SELECT
        DATE_FORMAT(date, '%Y-%m-%d') AS date,
        hour,
        COALESCE(adjusted_number_of_sessions, number_of_sessions) AS sessions,
        number_of_atc_sessions AS atc
      FROM hourly_sessions_summary_shopify
      WHERE date >= ? AND date <= ? AND hour <= ?
      ORDER BY date ASC, hour ASC
    `;
    sessionRowsPromise = conn.query(sessionSql, {
      type: QueryTypes.SELECT,
      replacements: [start, end, cutoffHour],
    });
  }

  const [orderRows, sessionRows] = await Promise.all([
    conn.query(orderSql, {
      type: QueryTypes.SELECT,
      replacements: orderReplacements,
    }),
    sessionRowsPromise,
  ]);

  const byKey = new Map();
  for (const row of orderRows) {
    const key = `${row.date}#${row.hour}`;
    byKey.set(key, {
      date: String(row.date),
      hour: Number(row.hour || 0),
      sales: Number(row.sales || 0),
      orders: Number(row.orders || 0),
      sessions: 0,
      atc: 0,
    });
  }
  for (const row of sessionRows) {
    const key = `${row.date}#${row.hour}`;
    const existing = byKey.get(key) || {
      date: String(row.date),
      hour: Number(row.hour || 0),
      sales: 0,
      orders: 0,
      sessions: 0,
      atc: 0,
    };
    existing.sessions += Number(row.sessions || 0);
    existing.atc += Number(row.atc || 0);
    byKey.set(key, existing);
  }

  return Array.from(byKey.values()).sort((a, b) => {
    if (a.date === b.date) return a.hour - b.hour;
    return a.date.localeCompare(b.date);
  });
}

async function fetchDailyRows(conn, start, end, filters = {}) {
  const hasProduct = !!filters.product_id;
  const hasDevice = !!filters.device_type;
  const hasSnapshot = hasSnapshotFilters(filters);
  const hasSalesChannel = !!filters.sales_channel;

  if (!hasProduct && !hasDevice && !hasSnapshot && !hasSalesChannel) {
    const salesSql = `
      SELECT
        DATE_FORMAT(date, '%Y-%m-%d') AS date,
        COALESCE(SUM(total_sales), 0) AS sales,
        COALESCE(SUM(number_of_orders), 0) AS orders
      FROM hour_wise_sales
      WHERE date >= ? AND date <= ?
      GROUP BY date
      ORDER BY date ASC
    `;
    const sessionSql = `
      SELECT
        DATE_FORMAT(date, '%Y-%m-%d') AS date,
        COALESCE(SUM(COALESCE(adjusted_total_sessions, total_sessions)), 0) AS sessions,
        COALESCE(SUM(total_atc_sessions), 0) AS atc
      FROM overall_summary
      WHERE date >= ? AND date <= ?
      GROUP BY date
      ORDER BY date ASC
    `;
    const [salesRows, sessionRows] = await Promise.all([
      conn.query(salesSql, {
        type: QueryTypes.SELECT,
        replacements: [start, end],
      }),
      conn.query(sessionSql, {
        type: QueryTypes.SELECT,
        replacements: [start, end],
      }),
    ]);
    const byDate = new Map();
    for (const row of salesRows) {
      byDate.set(String(row.date), {
        date: String(row.date),
        sales: Number(row.sales || 0),
        orders: Number(row.orders || 0),
        sessions: 0,
        atc: 0,
      });
    }
    for (const row of sessionRows) {
      const existing = byDate.get(String(row.date)) || {
        date: String(row.date),
        sales: 0,
        orders: 0,
        sessions: 0,
        atc: 0,
      };
      existing.sessions += Number(row.sessions || 0);
      existing.atc += Number(row.atc || 0);
      byDate.set(String(row.date), existing);
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  let orderSql = `
    SELECT
      created_date AS date,
      COUNT(DISTINCT order_name) AS orders,
      ${filters.product_id ? `COALESCE(SUM((line_item_price - COALESCE(discount_amount_per_line_item, 0)) * line_item_quantity), 0)` : `COALESCE(SUM(total_price), 0)`} AS sales
    FROM shopify_orders
    WHERE created_date >= ? AND created_date <= ?
  `;
  const orderReplacements = [start, end];
  orderSql = appendUtmWhere(orderSql, orderReplacements, filters);
  orderSql = appendProductFilter(orderSql, orderReplacements, filters.product_id);
  orderSql += ` GROUP BY created_date ORDER BY created_date ASC`;

  let sessionRowsPromise;
  if (hasProduct) {
    let sessionSql = `
      SELECT
        DATE_FORMAT(date, '%Y-%m-%d') AS date,
        COALESCE(SUM(sessions), 0) AS sessions,
        COALESCE(SUM(sessions_with_cart_additions), 0) AS atc
      FROM mv_product_sessions_by_path_daily
      WHERE date >= ? AND date <= ?
    `;
    const sessionReplacements = [start, end];
    sessionSql = appendProductFilter(sessionSql, sessionReplacements, filters.product_id);
    sessionSql += ` GROUP BY date ORDER BY date ASC`;
    sessionRowsPromise = conn.query(sessionSql, {
      type: QueryTypes.SELECT,
      replacements: sessionReplacements,
    });
  } else if (hasDevice) {
    const { sessionExpr, atcExpr } = buildDeviceExpressions(filters.device_type);
    const sessionRows = await conn.query(
      `
        SELECT
          DATE_FORMAT(date, '%Y-%m-%d') AS date,
          COALESCE(SUM(${sessionExpr}), 0) AS sessions,
          COALESCE(SUM(${atcExpr}), 0) AS atc
        FROM hourly_sessions_summary_shopify
        WHERE date >= ? AND date <= ?
        GROUP BY date
        ORDER BY date ASC
      `,
      {
        type: QueryTypes.SELECT,
        replacements: [start, end],
      },
    );
    sessionRowsPromise = Promise.resolve(sessionRows);
  } else if (hasSnapshot) {
    let sessionSql = `
      SELECT
        DATE_FORMAT(date, '%Y-%m-%d') AS date,
        COALESCE(SUM(sessions), 0) AS sessions,
        COALESCE(SUM(sessions_with_cart_additions), 0) AS atc
      FROM product_sessions_snapshot
      WHERE date >= ? AND date <= ?
    `;
    const sessionReplacements = [start, end];
    sessionSql = appendUtmWhere(sessionSql, sessionReplacements, buildSnapshotSessionFilters(filters), true);
    sessionSql += ` GROUP BY date ORDER BY date ASC`;
    sessionRowsPromise = conn.query(sessionSql, {
      type: QueryTypes.SELECT,
      replacements: sessionReplacements,
    });
  } else {
    const sessionSql = `
      SELECT
        DATE_FORMAT(date, '%Y-%m-%d') AS date,
        COALESCE(SUM(COALESCE(adjusted_total_sessions, total_sessions)), 0) AS sessions,
        COALESCE(SUM(total_atc_sessions), 0) AS atc
      FROM overall_summary
      WHERE date >= ? AND date <= ?
      GROUP BY date
      ORDER BY date ASC
    `;
    sessionRowsPromise = conn.query(sessionSql, {
      type: QueryTypes.SELECT,
      replacements: [start, end],
    });
  }

  const [orderRows, sessionRows] = await Promise.all([
    conn.query(orderSql, {
      type: QueryTypes.SELECT,
      replacements: orderReplacements,
    }),
    sessionRowsPromise,
  ]);
  const byDate = new Map();
  for (const row of orderRows) {
    byDate.set(String(row.date), {
      date: String(row.date),
      sales: Number(row.sales || 0),
      orders: Number(row.orders || 0),
      sessions: 0,
      atc: 0,
    });
  }
  for (const row of sessionRows) {
    const existing = byDate.get(String(row.date)) || {
      date: String(row.date),
      sales: 0,
      orders: 0,
      sessions: 0,
      atc: 0,
    };
    existing.sessions += Number(row.sessions || 0);
    existing.atc += Number(row.atc || 0);
    byDate.set(String(row.date), existing);
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchMonthlyRows(conn, start, end, filters = {}) {
  const dailyRows = await fetchDailyRows(conn, start, end, filters);
  const byMonth = new Map();
  for (const row of dailyRows) {
    const bucket = monthBucket(row.date);
    const existing = byMonth.get(bucket) || {
      startDate: row.date,
      endDate: row.date,
      sales: 0,
      orders: 0,
      sessions: 0,
      atc: 0,
    };
    existing.startDate = row.date < existing.startDate ? row.date : existing.startDate;
    existing.endDate = row.date > existing.endDate ? row.date : existing.endDate;
    existing.sales += Number(row.sales || 0);
    existing.orders += Number(row.orders || 0);
    existing.sessions += Number(row.sessions || 0);
    existing.atc += Number(row.atc || 0);
    byMonth.set(bucket, existing);
  }

  return Array.from(byMonth.entries())
    .map(([date, metrics]) => ({
      date,
      startDate: metrics.startDate,
      endDate: metrics.endDate,
      metrics: buildMetricShape(metrics),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildHourlyPoints(rows, start, end, aggregate = "") {
  const todayIst = getTodayIst();
  const alignHour = end === todayIst ? getNowIst().getUTCHours() : 23;
  const rowMap = new Map(rows.map((row) => [`${row.date}#${row.hour}`, row]));
  const buckets = [];
  for (const day of buildSeriesBuckets(start, end)) {
    const maxHour = day === end ? alignHour : 23;
    for (let hour = 0; hour <= maxHour; hour += 1) {
      buckets.push({ date: day, hour });
    }
  }

  if (aggregate === "avg-by-hour" || aggregate === "avg-hour" || aggregate === "avg") {
    const acc = Array.from({ length: 24 }, () => ({
      count: 0,
      sales: 0,
      orders: 0,
      sessions: 0,
      atc: 0,
    }));
    for (const bucket of buckets) {
      const row = rowMap.get(`${bucket.date}#${bucket.hour}`) || {};
      const target = acc[bucket.hour];
      target.count += 1;
      target.sales += Number(row.sales || 0);
      target.orders += Number(row.orders || 0);
      target.sessions += Number(row.sessions || 0);
      target.atc += Number(row.atc || 0);
    }
    return acc.slice(0, alignHour + 1).map((metrics, hour) => ({
      hour,
      label: `${pad2(hour)}:00`,
      metrics: buildMetricShape({
        sales: metrics.count ? metrics.sales / metrics.count : 0,
        orders: metrics.count ? metrics.orders / metrics.count : 0,
        sessions: metrics.count ? metrics.sessions / metrics.count : 0,
        atc: metrics.count ? metrics.atc / metrics.count : 0,
      }),
    }));
  }

  return buckets.map((bucket) => ({
    date: bucket.date,
    hour: bucket.hour,
    label: `${bucket.date.slice(8, 10)} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(bucket.date.slice(5, 7)) - 1]} ${pad2(bucket.hour)}:00`,
    metrics: buildMetricShape(rowMap.get(`${bucket.date}#${bucket.hour}`) || {}),
  }));
}

function buildDailyPoints(rows, start, end) {
  const rowMap = new Map(rows.map((row) => [row.date, row]));
  return buildSeriesBuckets(start, end).map((date) => ({
    date,
    metrics: buildMetricShape(rowMap.get(date) || {}),
  }));
}

function buildRollingSeriesFromDailyRows(rows, end) {
  const endDate = end;
  const startDate = shiftDays(endDate, -58);
  const allDays = buildSeriesBuckets(startDate, endDate);
  const dayMap = new Map(rows.map((row) => [row.date, row]));
  const running = [];
  for (const day of allDays) {
    const row = dayMap.get(day) || {
      date: day,
      sales: 0,
      orders: 0,
      sessions: 0,
    };
    running.push({
      date: day,
      sales: Number(row.sales || 0),
      orders: Number(row.orders || 0),
      sessions: Number(row.sessions || 0),
    });
  }

  const window = [];
  let salesSum = 0;
  let ordersSum = 0;
  let sessionsSum = 0;
  const series = [];
  for (const dayRow of running) {
    window.push(dayRow);
    salesSum += dayRow.sales;
    ordersSum += dayRow.orders;
    sessionsSum += dayRow.sessions;
    if (window.length > 30) {
      const removed = window.shift();
      salesSum -= removed.sales;
      ordersSum -= removed.orders;
      sessionsSum -= removed.sessions;
    }
    if (window.length === 30) {
      const aov = ordersSum > 0 ? salesSum / ordersSum : 0;
      const cvr = sessionsSum > 0 ? ordersSum / sessionsSum : 0;
      series.push({
        date: dayRow.date,
        window_start: window[0].date,
        window_end: dayRow.date,
        aov_30d: aov,
        aov_totals: {
          total_sales: salesSum,
          total_orders: ordersSum,
        },
        cvr_30d: cvr,
        cvr_percent_30d: cvr * 100,
        cvr_totals: {
          total_orders: ordersSum,
          total_sessions: sessionsSum,
        },
      });
    }
  }
  return series;
}

function buildMetricsSnapshotService(deps = {}) {
  const { fetchCachedMetricsBatch } = deps;
  const now = deps.now || (() => new Date());
  const deltaMethods = buildMetricsDeltaMethods(deps);

  async function getSnapshot({ conn, range, filters = {}, cutoffTime = null, cachedData = null }) {
    if (!conn) throw new Error("Database connection unavailable");
    const { start, end } = range;

    if (cachedData && isCacheEligible(range, filters, cutoffTime)) {
      const returnsObj = await getReturnsSnapshot(conn, start, end, filters);
      return buildCachedSnapshot(cachedData, returnsObj, "cache+db_returns");
    }

    let metrics;
    if (!cutoffTime && !hasAnyFilters(filters)) {
      metrics = await queryOverallSummaryTotals(conn, start, end);
    } else {
      const cutoffHour = cutoffTime ? parseHourFromCutoff(cutoffTime) : 23;
      const [orderSales, sessionTotals, returnsObj] = await Promise.all([
        queryOrderSalesTotals(conn, start, end, filters, cutoffTime),
        (() => {
          if (cutoffTime) {
            if (filters.product_id || hasSnapshotFilters(filters)) {
              return queryHourlyProductSessionTotals(
                conn,
                start,
                end,
                cutoffHour,
                filters,
              );
            }
            if (filters.device_type) {
              return queryDeviceHourlyTotals(conn, start, end, filters, cutoffHour);
            }
            return queryHourlySessionTotals(conn, start, end, cutoffHour);
          }
          if (filters.product_id) {
            return queryProductDailySessionTotals(conn, start, end, filters);
          }
          if (filters.device_type) {
            return queryDeviceHourlyTotals(conn, start, end, filters, 23);
          }
          if (hasSnapshotFilters(filters)) {
            return querySnapshotSessionTotals(conn, start, end, filters);
          }
          return queryOverallSummaryTotals(conn, start, end);
        })(),
        getReturnsSnapshot(conn, start, end, filters),
      ]);
      return buildSnapshotPayload(
        {
          total_orders: orderSales.total_orders,
          total_sales: orderSales.total_sales,
          total_sessions: sessionTotals.total_sessions,
          total_atc_sessions: sessionTotals.total_atc_sessions,
        },
        returnsObj,
        "db",
      );
    }

    const returnsObj = await getReturnsSnapshot(conn, start, end, filters);
    return buildSnapshotPayload(metrics, returnsObj, "db");
  }

  async function getSnapshotPair({ conn, brandKey, currentRange, previousRange, filters = {}, cutoffTime = null }) {
    let cachedCurrent = null;
    let cachedPrevious = null;
    if (
      fetchCachedMetricsBatch &&
      isCacheEligible(currentRange, filters, cutoffTime) &&
      isCacheEligible(previousRange, filters, cutoffTime)
    ) {
      const [currentCached, previousCached] = await fetchCachedMetricsBatch(
        brandKey,
        [currentRange.start, previousRange.start],
      );
      cachedCurrent = currentCached;
      cachedPrevious = previousCached;
    }

    const [current, previous] = await Promise.all([
      getSnapshot({
        conn,
        range: currentRange,
        filters,
        cutoffTime,
        cachedData: cachedCurrent,
      }),
      getSnapshot({
        conn,
        range: previousRange,
        filters,
        cutoffTime,
        cachedData: cachedPrevious,
      }),
    ]);

    return { current, previous };
  }

  async function getDeltaSummary(spec) {
    const compareRange = getComparableRange(
      spec.start,
      spec.end,
      spec.compareStart,
      spec.compareEnd,
    );
    if (!compareRange) {
      throw new Error("Previous range unavailable");
    }
    const cutoffCtx = buildCutoffContext(spec.start, spec.end, now());
    const cutoffTime = cutoffCtx.includesToday ? cutoffCtx.cutoffTime : null;
    const { current, previous } = await getSnapshotPair({
      conn: spec.conn,
      brandKey: spec.brandKey,
      currentRange: { start: spec.start, end: spec.end },
      previousRange: compareRange,
      filters: spec.filters,
      cutoffTime,
    });

    let deltaCurrent = current;
    let deltaPrevious = previous;
    if (spec.filters.sales_channel) {
      const { sales_channel, ...filtersWithoutChannel } = spec.filters;
      const pair = await getSnapshotPair({
        conn: spec.conn,
        brandKey: spec.brandKey,
        currentRange: { start: spec.start, end: spec.end },
        previousRange: compareRange,
        filters: filtersWithoutChannel,
        cutoffTime,
      });
      deltaCurrent = pair.current;
      deltaPrevious = pair.previous;
      void sales_channel;
    }

    const legacyRowTwo = await getLegacyRowTwoSnapshots({
      conn: spec.conn,
      currentRange: { start: spec.start, end: spec.end },
      previousRange: compareRange,
      filters: spec.filters,
      cutoffCtx,
    });
    const legacyDeltaRowTwo =
      spec.filters.sales_channel && legacyRowTwo
        ? await getLegacyRowTwoSnapshots({
            conn: spec.conn,
            currentRange: { start: spec.start, end: spec.end },
            previousRange: compareRange,
            filters: {
              ...spec.filters,
              sales_channel: undefined,
            },
            cutoffCtx,
          })
        : legacyRowTwo;

    const currentRowTwo = legacyRowTwo?.current || current;
    const previousRowTwo = legacyRowTwo?.previous || previous;
    const deltaCurrentRowTwo = legacyDeltaRowTwo?.current || deltaCurrent;
    const deltaPreviousRowTwo = legacyDeltaRowTwo?.previous || deltaPrevious;

    return {
      range: { start: spec.start, end: spec.end },
      prev_range: compareRange,
      metrics: {
        total_orders: {
          metric: "TOTAL_ORDERS_DELTA",
          range: { start: spec.start, end: spec.end },
          ...buildMetricDelta(
            "TOTAL_ORDERS_DELTA",
            current.total_orders,
            previous.total_orders,
            deltaCurrent.total_orders,
            deltaPrevious.total_orders,
          ),
        },
        total_sales: {
          metric: "TOTAL_SALES_DELTA",
          range: { start: spec.start, end: spec.end },
          ...buildMetricDelta(
            "TOTAL_SALES_DELTA",
            current.total_sales,
            previous.total_sales,
            deltaCurrent.total_sales,
            deltaPrevious.total_sales,
          ),
        },
        total_sessions: {
          metric: "TOTAL_SESSIONS_DELTA",
          range: { start: spec.start, end: spec.end },
          ...buildMetricDelta(
            "TOTAL_SESSIONS_DELTA",
            currentRowTwo.total_sessions,
            previousRowTwo.total_sessions,
            deltaCurrentRowTwo.total_sessions,
            deltaPreviousRowTwo.total_sessions,
          ),
        },
        total_atc_sessions: {
          metric: "TOTAL_ATC_SESSIONS_DELTA",
          range: { start: spec.start, end: spec.end },
          ...buildMetricDelta(
            "TOTAL_ATC_SESSIONS_DELTA",
            currentRowTwo.total_atc_sessions,
            previousRowTwo.total_atc_sessions,
            deltaCurrentRowTwo.total_atc_sessions,
            deltaPreviousRowTwo.total_atc_sessions,
          ),
        },
        average_order_value: {
          metric: "AOV_DELTA",
          range: { start: spec.start, end: spec.end },
          ...buildMetricDelta(
            "AOV_DELTA",
            current.average_order_value,
            previous.average_order_value,
            deltaCurrent.average_order_value,
            deltaPrevious.average_order_value,
          ),
        },
        conversion_rate: {
          metric: "CVR_DELTA",
          range: { start: spec.start, end: spec.end },
          ...buildMetricDelta(
            "CVR_DELTA",
            currentRowTwo.conversion_rate_percent,
            previousRowTwo.conversion_rate_percent,
            deltaCurrentRowTwo.conversion_rate_percent,
            deltaPreviousRowTwo.conversion_rate_percent,
          ),
        },
      },
    };
  }

  async function getDashboardSummary(spec) {
    const compareRange = getComparableRange(
      spec.start,
      spec.end,
      spec.compareStart,
      spec.compareEnd,
    );
    if (!compareRange) {
      throw new Error("Previous range unavailable");
    }
    const cutoffCtx = buildCutoffContext(spec.start, spec.end, now());
    const cutoffTime = cutoffCtx.includesToday ? cutoffCtx.cutoffTime : null;
    const { current, previous } = await getSnapshotPair({
      conn: spec.conn,
      brandKey: spec.brandKey,
      currentRange: { start: spec.start, end: spec.end },
      previousRange: compareRange,
      filters: spec.filters,
      cutoffTime,
    });

    let deltaCurrent = current;
    let deltaPrevious = previous;
    if (spec.filters.sales_channel) {
      const { sales_channel, ...filtersWithoutChannel } = spec.filters;
      const pair = await getSnapshotPair({
        conn: spec.conn,
        brandKey: spec.brandKey,
        currentRange: { start: spec.start, end: spec.end },
        previousRange: compareRange,
        filters: filtersWithoutChannel,
        cutoffTime,
      });
      deltaCurrent = pair.current;
      deltaPrevious = pair.previous;
      void sales_channel;
    }

    const legacyRowTwo = await getLegacyRowTwoSnapshots({
      conn: spec.conn,
      currentRange: { start: spec.start, end: spec.end },
      previousRange: compareRange,
      filters: spec.filters,
      cutoffCtx,
    });
    const legacyDeltaRowTwo =
      spec.filters.sales_channel && legacyRowTwo
        ? await getLegacyRowTwoSnapshots({
            conn: spec.conn,
            currentRange: { start: spec.start, end: spec.end },
            previousRange: compareRange,
            filters: {
              ...spec.filters,
              sales_channel: undefined,
            },
            cutoffCtx,
          })
        : legacyRowTwo;

    const currentRowTwo = legacyRowTwo?.current || current;
    const previousRowTwo = legacyRowTwo?.previous || previous;
    const deltaCurrentRowTwo = legacyDeltaRowTwo?.current || deltaCurrent;
    const deltaPreviousRowTwo = legacyDeltaRowTwo?.previous || deltaPrevious;

    return {
      filter_options: null,
      range: { start: spec.start, end: spec.end },
      prev_range: compareRange,
      metrics: {
        total_orders: buildSummaryMetric(
          current.total_orders,
          previous.total_orders,
          deltaCurrent.total_orders,
          deltaPrevious.total_orders,
        ),
        total_sales: buildSummaryMetric(
          current.total_sales,
          previous.total_sales,
          deltaCurrent.total_sales,
          deltaPrevious.total_sales,
        ),
        average_order_value: buildSummaryMetric(
          current.average_order_value,
          previous.average_order_value,
          deltaCurrent.average_order_value,
          deltaPrevious.average_order_value,
        ),
        conversion_rate: buildSummaryMetric(
          currentRowTwo.conversion_rate_percent,
          previousRowTwo.conversion_rate_percent,
          deltaCurrentRowTwo.conversion_rate_percent,
          deltaPreviousRowTwo.conversion_rate_percent,
        ),
        total_sessions: buildSummaryMetric(
          currentRowTwo.total_sessions,
          previousRowTwo.total_sessions,
          deltaCurrentRowTwo.total_sessions,
          deltaPreviousRowTwo.total_sessions,
        ),
        total_atc_sessions: buildSummaryMetric(
          currentRowTwo.total_atc_sessions,
          previousRowTwo.total_atc_sessions,
          deltaCurrentRowTwo.total_atc_sessions,
          deltaPreviousRowTwo.total_atc_sessions,
        ),
        cancelled_orders: buildSummaryMetric(
          current.cancelled_orders,
          previous.cancelled_orders,
          deltaCurrent.cancelled_orders,
          deltaPrevious.cancelled_orders,
        ),
        refunded_orders: buildSummaryMetric(
          current.refunded_orders,
          previous.refunded_orders,
          deltaCurrent.refunded_orders,
          deltaPrevious.refunded_orders,
        ),
      },
      sources: {
        current: current.source,
        previous: previous.source,
        hourly_cutoff: cutoffTime,
      },
    };
  }

  async function getSummaryFilterOptions({ conn, start, end }) {
    const [channelRows, utmRows] = await Promise.all([
      conn.query(
        `
          SELECT DISTINCT order_app_name AS val
          FROM shopify_orders
          WHERE created_date >= ? AND created_date <= ?
            AND order_app_name IS NOT NULL AND order_app_name <> ''
          ORDER BY val
        `,
        {
          type: QueryTypes.SELECT,
          replacements: [start, end],
        },
      ),
      conn.query(
        `
          SELECT DISTINCT utm_source, utm_medium, utm_campaign, utm_term, utm_content
          FROM shopify_orders
          WHERE created_date >= ? AND created_date <= ?
            AND utm_source IS NOT NULL AND utm_source <> ''
          ORDER BY utm_source, utm_medium, utm_campaign, utm_term, utm_content
        `,
        {
          type: QueryTypes.SELECT,
          replacements: [start, end],
        },
      ),
    ]);

    const utmTree = {};
    for (const row of utmRows) {
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
      sales_channel: channelRows.map((row) => row.val),
      utm_tree: utmTree,
    };
  }

  async function getTrend(spec, granularity) {
    const compareRange = getComparableRange(
      spec.start,
      spec.end,
      spec.compareStart,
      spec.compareEnd,
    );
    const cutoffCtx = buildCutoffContext(spec.start, spec.end, now());
    const cutoffHour = cutoffCtx.includesToday ? cutoffCtx.cutoffHour : 23;
    let currentRows;
    let previousRows = [];

    if (granularity === "hourly") {
      [currentRows, previousRows] = await Promise.all([
        fetchHourlyRows(spec.conn, spec.start, spec.end, spec.filters, cutoffHour),
        compareRange
          ? fetchHourlyRows(
              spec.conn,
              compareRange.start,
              compareRange.end,
              spec.filters,
              cutoffCtx.includesToday ? cutoffHour : 23,
            )
          : Promise.resolve([]),
      ]);
      const points = buildHourlyPoints(currentRows, spec.start, spec.end, spec.aggregate);
      const comparison = compareRange
        ? {
            range: compareRange,
            points: buildHourlyPoints(previousRows, compareRange.start, compareRange.end, "avg"),
            hourSampleCount: null,
          }
        : null;
      return {
        range: { start: spec.start, end: spec.end },
        timezone: "IST",
        alignHour: cutoffHour,
        points,
        comparison,
      };
    }

    if (granularity === "daily") {
      [currentRows, previousRows] = await Promise.all([
        fetchDailyRows(spec.conn, spec.start, spec.end, spec.filters),
        compareRange
          ? fetchDailyRows(spec.conn, compareRange.start, compareRange.end, spec.filters)
          : Promise.resolve([]),
      ]);
      const points = buildDailyPoints(currentRows, spec.start, spec.end);
      const comparison = compareRange
        ? {
            range: compareRange,
            points: buildDailyPoints(previousRows, compareRange.start, compareRange.end),
          }
        : null;
      return {
        range: { start: spec.start, end: spec.end },
        points,
        days: points,
        comparison: comparison ? { ...comparison, days: comparison.points } : null,
      };
    }

    [currentRows, previousRows] = await Promise.all([
      fetchMonthlyRows(spec.conn, spec.start, spec.end, spec.filters),
      compareRange
        ? fetchMonthlyRows(spec.conn, compareRange.start, compareRange.end, spec.filters)
        : Promise.resolve([]),
    ]);
    return {
      range: { start: spec.start, end: spec.end },
      points: currentRows,
      months: currentRows,
      comparison: compareRange
        ? {
            range: compareRange,
            points: previousRows,
            months: previousRows,
          }
        : null,
    };
  }

  async function getRolling30d({ conn, brandKey, end, filters = {} }) {
    let resolvedEnd = end || null;
    if (resolvedEnd) {
      const parsed = isoDate.safeParse(resolvedEnd);
      if (!parsed.success) {
        const error = new Error("Invalid end date. Use YYYY-MM-DD");
        error.status = 400;
        throw error;
      }
      resolvedEnd = parsed.data;
    } else {
      const rows = await conn.query(`SELECT MAX(date) AS max_d FROM overall_summary`, {
        type: QueryTypes.SELECT,
      });
      resolvedEnd = rows?.[0]?.max_d || formatIsoDate(new Date());
    }

    const dailyStart = shiftDays(resolvedEnd, -58);
    const dailyRows = await fetchDailyRows(conn, dailyStart, resolvedEnd, filters);
    return {
      metric: "ROLLING_30D_SERIES",
      brand: brandKey || null,
      end: resolvedEnd,
      days: buildRollingSeriesFromDailyRows(dailyRows, resolvedEnd),
    };
  }

  async function getDeltaMetric(spec, metricName) {
    const compareRange = getComparableRange(
      spec.start,
      spec.end,
      spec.compareStart,
      spec.compareEnd,
    );
    if (!compareRange) {
      throw new Error("Previous range unavailable");
    }
    const cutoffCtx = buildCutoffContext(spec.start, spec.end, now());
    const cutoffTime = (spec.align === "hour" || cutoffCtx.includesToday)
      ? cutoffCtx.cutoffTime
      : null;
    const { current, previous } = await getSnapshotPair({
      conn: spec.conn,
      brandKey: spec.brandKey,
      currentRange: { start: spec.start, end: spec.end },
      previousRange: compareRange,
      filters: spec.filters,
      cutoffTime,
    });

    const legacyRowTwo = await getLegacyRowTwoSnapshots({
      conn: spec.conn,
      currentRange: { start: spec.start, end: spec.end },
      previousRange: compareRange,
      filters: spec.filters,
      cutoffCtx,
    });

    const metricMap = {
      TOTAL_ORDERS_DELTA: "total_orders",
      TOTAL_SALES_DELTA: "total_sales",
      TOTAL_SESSIONS_DELTA: "total_sessions",
      ATC_SESSIONS_DELTA: "total_atc_sessions",
      AOV_DELTA: "average_order_value",
      CVR_DELTA: "conversion_rate_percent",
    };
    const key = metricMap[metricName];
    const currentSource =
      legacyRowTwo &&
      (metricName === "TOTAL_SESSIONS_DELTA" ||
        metricName === "ATC_SESSIONS_DELTA" ||
        metricName === "CVR_DELTA")
        ? legacyRowTwo.current
        : current;
    const previousSource =
      legacyRowTwo &&
      (metricName === "TOTAL_SESSIONS_DELTA" ||
        metricName === "ATC_SESSIONS_DELTA" ||
        metricName === "CVR_DELTA")
        ? legacyRowTwo.previous
        : previous;
    const delta = buildMetricDelta(
      metricName,
      currentSource[key],
      previousSource[key],
      currentSource[key],
      previousSource[key],
    );
    return {
      metric: metricName,
      range: { start: spec.start, end: spec.end },
      current: delta.current,
      previous: delta.previous,
      diff_pct: delta.diff_pct,
      direction: delta.direction,
    };
  }

  return {
    getSnapshot,
    getSnapshotPair,
    getDashboardSummary,
    getDeltaSummary,
    getTrend,
    getRolling30d,
    getDeltaMetric,
    getSummaryFilterOptions,
    getTotalOrdersDelta: deltaMethods.calcTotalOrdersDelta,
    getTotalSalesDelta: deltaMethods.calcTotalSalesDelta,
    getTotalSessionsDelta: deltaMethods.calcTotalSessionsDelta,
    getAtcSessionsDelta: deltaMethods.calcAtcSessionsDelta,
    getAovDelta: deltaMethods.calcAovDelta,
    getCvrDelta: deltaMethods.calcCvrDelta,
  };
}

module.exports = {
  normalizeMetricRequest,
  buildMetricsSnapshotService,
  buildCutoffContext,
};
