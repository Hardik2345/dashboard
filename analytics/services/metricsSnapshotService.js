const { QueryTypes } = require("sequelize");
const {
  computePercentDelta,
  computeReturnCounts,
  appendUtmWhere,
} = require("../utils/metricsUtils");
const {
  parseIsoDate,
  formatIsoDate,
} = require("../utils/dateUtils");
const {
  DAY_MS,
  pad2,
  getNowIst,
  getTodayIst,
  parseHourFromCutoff,
  resolveCompareRange,
  buildLiveCutoffContext,
  buildCompletedHourCutoffContext,
  buildRowTwoComparisonCutoffs,
} = require("./metricsFoundation");
const {
  normalizeMetricRequest,
} = require("./metricsRequestNormalizer");
const {
  queryOverallSummaryTotals,
  queryOverallSummaryPair,
  queryOrderSalesTotals,
  queryUtmAggregateTotals,
  queryUtmAggregatePair,
  queryUtmAggregateRows,
  queryUtmSummaryFilterOptions,
  queryProductDailySessionTotals,
  resolveUtmAggregateSource,
} = require("./metricsAggregateService");

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

function getUtmAggregateSource(filters = {}, granularity = "daily") {
  return resolveUtmAggregateSource(filters, granularity);
}

async function queryCurrentRowTwoSessionTotals(
  conn,
  start,
  end,
  filters = {},
  cutoffHour = 23,
) {
  if (getUtmAggregateSource(filters, "hourly")) {
    const totals = await queryUtmAggregateTotals(conn, start, end, filters, {
      granularity: "hourly",
      cutoffHour,
    });
    return {
      total_sessions: totals.total_sessions,
      total_atc_sessions: totals.total_atc_sessions,
    };
  }
  if (filters.device_type) {
    return queryDeviceHourlyTotals(conn, start, end, filters, cutoffHour);
  }
  if (filters.product_id || hasSnapshotFilters(filters)) {
    return queryHourlyProductSessionTotals(conn, start, end, cutoffHour, filters);
  }
  if (!hasAnyFilters(filters)) {
    return queryHourlySessionTotals(conn, start, end, cutoffHour);
  }
  return queryHourlySessionTotals(conn, start, end, cutoffHour);
}

async function queryPreviousRowTwoSessionTotals(
  conn,
  start,
  end,
  filters = {},
  cutoffHour = 23,
) {
  if (getUtmAggregateSource(filters, "hourly")) {
    const totals = await queryUtmAggregateTotals(conn, start, end, filters, {
      granularity: "hourly",
      cutoffHour,
    });
    return {
      total_sessions: totals.total_sessions,
      total_atc_sessions: totals.total_atc_sessions,
    };
  }
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
  if (getUtmAggregateSource(filters, "daily")) {
    const totals = await queryUtmAggregateTotals(conn, start, end, filters, {
      granularity: "daily",
    });
    return {
      cancelled_orders: Number(totals?.cancelled_orders || 0),
      refunded_orders: Number(totals?.refunded_orders || 0),
    };
  }
  const rows = await computeReturnCounts({ start, end, conn, filters });
  return {
    cancelled_orders: Number(rows.cancelled_orders || 0),
    refunded_orders: Number(rows.refunded_orders || 0),
  };
}

async function getReturnsSnapshotPair(conn, currentRange, previousRange, filters = {}) {
  if (getUtmAggregateSource(filters, "daily")) {
    const pair = await queryUtmAggregatePair(
      conn,
      currentRange,
      previousRange,
      filters,
      { granularity: "daily" },
    );
    return {
      current: {
        cancelled_orders: Number(pair?.current?.cancelled_orders || 0),
        refunded_orders: Number(pair?.current?.refunded_orders || 0),
      },
      previous: {
        cancelled_orders: Number(pair?.previous?.cancelled_orders || 0),
        refunded_orders: Number(pair?.previous?.refunded_orders || 0),
      },
    };
  }
  const combinedStart =
    currentRange.start <= previousRange.start
      ? currentRange.start
      : previousRange.start;
  const combinedEnd =
    currentRange.end >= previousRange.end
      ? currentRange.end
      : previousRange.end;

  const rows = await conn.query(
    `
      SELECT
        COALESCE(SUM(CASE WHEN event_type = 'CANCEL' AND event_date >= ? AND event_date <= ? THEN 1 ELSE 0 END), 0) AS current_cancelled_orders,
        COALESCE(SUM(CASE WHEN event_type = 'REFUND' AND event_date >= ? AND event_date <= ? THEN 1 ELSE 0 END), 0) AS current_refunded_orders,
        COALESCE(SUM(CASE WHEN event_type = 'CANCEL' AND event_date >= ? AND event_date <= ? THEN 1 ELSE 0 END), 0) AS previous_cancelled_orders,
        COALESCE(SUM(CASE WHEN event_type = 'REFUND' AND event_date >= ? AND event_date <= ? THEN 1 ELSE 0 END), 0) AS previous_refunded_orders
      FROM returns_fact
      WHERE event_date >= ? AND event_date <= ?
    `,
    {
      type: QueryTypes.SELECT,
      replacements: [
        currentRange.start,
        currentRange.end,
        currentRange.start,
        currentRange.end,
        previousRange.start,
        previousRange.end,
        previousRange.start,
        previousRange.end,
        combinedStart,
        combinedEnd,
      ],
    },
  );
  const row = rows?.[0] || {};
  return {
    current: {
      cancelled_orders: Number(row.current_cancelled_orders || 0),
      refunded_orders: Number(row.current_refunded_orders || 0),
    },
    previous: {
      cancelled_orders: Number(row.previous_cancelled_orders || 0),
      refunded_orders: Number(row.previous_refunded_orders || 0),
    },
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

async function getRowTwoComparisonSnapshots({
  conn,
  currentRange,
  previousRange,
  filters = {},
  cutoffCtx,
}) {
  if (!(cutoffCtx?.includesToday || cutoffCtx?.currentRangeIncludesToday)) {
    return null;
  }

  const {
    currentCutoffHour,
    currentOrderCutoffTime,
    previousSessionCutoffHour,
    previousOrderCutoffTime,
  } = buildRowTwoComparisonCutoffs(cutoffCtx);

  if (getUtmAggregateSource(filters, "hourly")) {
    const [currentTotals, previousTotals] = await Promise.all([
      queryUtmAggregateTotals(conn, currentRange.start, currentRange.end, filters, {
        granularity: "hourly",
        cutoffHour: currentCutoffHour,
      }),
      queryUtmAggregateTotals(conn, previousRange.start, previousRange.end, filters, {
        granularity: "hourly",
        cutoffHour: previousSessionCutoffHour,
      }),
    ]);

    const currentTotalOrders = Number(currentTotals?.total_orders || 0);
    const currentTotalSessions = Number(currentTotals?.total_sessions || 0);
    const currentTotalAtcSessions = Number(currentTotals?.total_atc_sessions || 0);
    const previousTotalOrders = Number(previousTotals?.total_orders || 0);
    const previousTotalSessions = Number(previousTotals?.total_sessions || 0);
    const previousTotalAtcSessions = Number(previousTotals?.total_atc_sessions || 0);

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

  const [currentOrders, currentSessions, previousOrders, previousSessions] =
    await Promise.all([
      queryOrderSalesTotals(
        conn,
        currentRange.start,
        currentRange.end,
        filters,
        currentOrderCutoffTime,
      ),
      queryCurrentRowTwoSessionTotals(
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
      queryPreviousRowTwoSessionTotals(
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

  if (getUtmAggregateSource(filters, "hourly")) {
    return queryUtmAggregateRows(conn, start, end, filters, {
      granularity: "hourly",
      cutoffHour,
    });
  }

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

  if (getUtmAggregateSource(filters, "daily")) {
    return queryUtmAggregateRows(conn, start, end, filters, {
      granularity: "daily",
    });
  }

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

function buildMetricsSnapshotService(deps = {}) {
  const { fetchCachedMetricsBatch } = deps;
  const now = deps.now || (() => new Date());

  async function getSnapshot({ conn, range, filters = {}, cutoffTime = null, cachedData = null }) {
    if (!conn) throw new Error("Database connection unavailable");
    const { start, end } = range;

    if (cachedData && isCacheEligible(range, filters, cutoffTime)) {
      const returnsObj = await getReturnsSnapshot(conn, start, end, filters);
      return buildCachedSnapshot(cachedData, returnsObj, "cache+db_returns");
    }

    if (getUtmAggregateSource(filters, cutoffTime ? "hourly" : "daily")) {
      const cutoffHour = cutoffTime ? parseHourFromCutoff(cutoffTime) : null;
      const totals = await queryUtmAggregateTotals(conn, start, end, filters, {
        granularity: cutoffTime ? "hourly" : "daily",
        cutoffHour,
      });
      return buildSnapshotPayload(
        totals,
        {
          cancelled_orders: totals.cancelled_orders,
          refunded_orders: totals.refunded_orders,
        },
        "db",
      );
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

  async function getSnapshotPair({
    conn,
    brandKey,
    currentRange,
    previousRange,
    filters = {},
    cutoffTime = null,
    currentCutoffHour = null,
    previousCutoffHour = null,
  }) {
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

    if (
      !cachedCurrent &&
      !cachedPrevious &&
      getUtmAggregateSource(
        filters,
        cutoffTime !== null ||
          currentCutoffHour !== null ||
          previousCutoffHour !== null
          ? "hourly"
          : "daily",
      )
    ) {
      const resolvedCurrentCutoffHour =
        currentCutoffHour !== null && currentCutoffHour !== undefined
          ? currentCutoffHour
          : cutoffTime
            ? parseHourFromCutoff(cutoffTime)
            : null;
      const resolvedPreviousCutoffHour =
        previousCutoffHour !== null && previousCutoffHour !== undefined
          ? previousCutoffHour
          : resolvedCurrentCutoffHour;
      const pair = await queryUtmAggregatePair(
        conn,
        currentRange,
        previousRange,
        filters,
        {
          granularity:
            cutoffTime !== null ||
            resolvedCurrentCutoffHour !== null ||
            resolvedPreviousCutoffHour !== null
              ? "hourly"
              : "daily",
          currentCutoffHour: resolvedCurrentCutoffHour,
          previousCutoffHour: resolvedPreviousCutoffHour,
        },
      );

      return {
        current: buildSnapshotPayload(
          pair.current,
          {
            cancelled_orders: pair.current.cancelled_orders,
            refunded_orders: pair.current.refunded_orders,
          },
          "db",
        ),
        previous: buildSnapshotPayload(
          pair.previous,
          {
            cancelled_orders: pair.previous.cancelled_orders,
            refunded_orders: pair.previous.refunded_orders,
          },
          "db",
        ),
      };
    }

    if (
      !cachedCurrent &&
      !cachedPrevious &&
      !cutoffTime &&
      !hasAnyFilters(filters)
    ) {
      const [metricsPair, returnsPair] = await Promise.all([
        queryOverallSummaryPair(conn, currentRange, previousRange),
        getReturnsSnapshotPair(conn, currentRange, previousRange, filters),
      ]);

      return {
        current: buildSnapshotPayload(metricsPair.current, returnsPair.current, "db"),
        previous: buildSnapshotPayload(
          metricsPair.previous,
          returnsPair.previous,
          "db",
        ),
      };
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
    const rowTwoCutoffCtx = buildCompletedHourCutoffContext(
      spec.start,
      spec.end,
      now(),
    );
    const useCompletedHourSummaryForUtm =
      !!getUtmAggregateSource(spec.filters, "daily") &&
      !!rowTwoCutoffCtx.currentRangeIncludesToday;
    const { current, previous } = await getSnapshotPair({
      conn: spec.conn,
      brandKey: spec.brandKey,
      currentRange: { start: spec.start, end: spec.end },
      previousRange: compareRange,
      filters: spec.filters,
      cutoffTime,
      currentCutoffHour: useCompletedHourSummaryForUtm
        ? rowTwoCutoffCtx.cutoffHour
        : null,
      previousCutoffHour: useCompletedHourSummaryForUtm
        ? rowTwoCutoffCtx.cutoffHour
        : null,
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
        currentCutoffHour: useCompletedHourSummaryForUtm
          ? rowTwoCutoffCtx.cutoffHour
          : null,
        previousCutoffHour: useCompletedHourSummaryForUtm
          ? rowTwoCutoffCtx.cutoffHour
          : null,
      });
      deltaCurrent = pair.current;
      deltaPrevious = pair.previous;
      void sales_channel;
    }

    const rowTwoComparison = await getRowTwoComparisonSnapshots({
      conn: spec.conn,
      currentRange: { start: spec.start, end: spec.end },
      previousRange: compareRange,
      filters: spec.filters,
      cutoffCtx: rowTwoCutoffCtx,
    });
    const deltaRowTwoComparison =
      spec.filters.sales_channel && rowTwoComparison
        ? await getRowTwoComparisonSnapshots({
            conn: spec.conn,
            currentRange: { start: spec.start, end: spec.end },
            previousRange: compareRange,
            filters: {
              ...spec.filters,
              sales_channel: undefined,
            },
            cutoffCtx: rowTwoCutoffCtx,
          })
        : rowTwoComparison;

    const currentRowTwo = rowTwoComparison?.current || current;
    const previousRowTwo = rowTwoComparison?.previous || previous;
    const deltaCurrentRowTwo = deltaRowTwoComparison?.current || deltaCurrent;
    const deltaPreviousRowTwo =
      deltaRowTwoComparison?.previous || deltaPrevious;

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
    return queryUtmSummaryFilterOptions(conn, start, end);
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

  return {
    getSnapshot,
    getSnapshotPair,
    getDashboardSummary,
    getTrend,
    getSummaryFilterOptions,
  };
}

module.exports = {
  normalizeMetricRequest,
  buildMetricsSnapshotService,
  buildCutoffContext,
};
