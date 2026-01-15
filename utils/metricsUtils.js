const { QueryTypes } = require('sequelize');
const { buildWhereClause } = require('./sql');
const { prevDayStr, daysInclusive, previousWindow } = require('./dateUtils');

// raw SUM helper to avoid ORM coercion issues
async function rawSum(column, { start, end, conn }) {
  const { where, params } = buildWhereClause(start, end);
  let selectExpr = column;
  if (column === 'total_sessions') {
    selectExpr = 'COALESCE(adjusted_total_sessions, total_sessions)';
  }
  const sql = `SELECT COALESCE(SUM(${selectExpr}), 0) AS total FROM overall_summary ${where}`;
  const rows = await conn.query(sql, { type: QueryTypes.SELECT, replacements: params });
  return Number(rows[0]?.total || 0);
}

const IST_OFFSET_MIN = 330;
const IST_OFFSET_MS = IST_OFFSET_MIN * 60 * 1000;

/**
 * Generic helper to compute aligned delta for any metric.
 * queryFn: ({ start, end, cutoffTime, targetHour, prevWin }) => Promise<{ currentVal, previousVal, currentMeta?, previousMeta? }>
 * If queryFn is provided, it handles the DB calls.
 * OR provide `sqlRange` and `sqlOverall` to let this helper run standard queries.
 */
async function computeMetricDelta({ metricName, range, queryFn }) {
  const { start, end } = range;
  const date = end || start;
  const rangeStart = start || date;
  const rangeEnd = end || date;

  const pad2 = (n) => String(n).padStart(2, '0');
  const nowUtc = new Date();
  const nowIst = new Date(nowUtc.getTime() + IST_OFFSET_MS);
  const yyyy = nowIst.getUTCFullYear();
  const mm = String(nowIst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(nowIst.getUTCDate()).padStart(2, '0');
  const todayIst = `${yyyy}-${mm}-${dd}`;

  const isRangeIncludesToday = rangeStart === todayIst || rangeEnd === todayIst;

  const resolveTargetHour = (endOrDate) => (endOrDate === todayIst ? nowIst.getUTCHours() : 23);
  const secondsNow = (nowIst.getUTCHours() * 3600) + (nowIst.getUTCMinutes() * 60) + nowIst.getUTCSeconds();
  const fullDaySeconds = 24 * 3600;
  const resolveSeconds = (targetDate) => (targetDate === todayIst ? secondsNow : fullDaySeconds);
  const secondsToTime = (secs) => {
    const hh = Math.floor(secs / 3600);
    const mm2 = Math.floor((secs % 3600) / 60);
    const ss = secs % 60;
    return `${pad2(hh)}:${pad2(mm2)}:${pad2(ss)}`;
  };

  const targetHour = resolveTargetHour(rangeEnd);
  // effectiveSeconds is the current time of day in IST (if today) or 24:00 (if past)
  const effectiveSeconds = Math.min(fullDaySeconds, Math.max(0, resolveSeconds(rangeEnd)));
  const cutoffTime = effectiveSeconds >= fullDaySeconds ? '24:00:00' : secondsToTime(effectiveSeconds);

  const prevWin = previousWindow(rangeStart, rangeEnd);

  // To avoid bias, we should use the SAME cutoff relative time for the previous period.
  // Previous logic used (targetHour - 1) for prev period if current was today, which caused bias.
  const prevCompareHour = targetHour;
  const prevCutoffTime = cutoffTime;

  let curVal = 0;
  let prevVal = 0;
  let curMeta = null;
  let prevMeta = null;

  if (queryFn) {
    const res = await queryFn({
      rangeStart, rangeEnd,
      prevStart: prevWin.prevStart, prevEnd: prevWin.prevEnd,
      targetHour, prevCompareHour,
      cutoffTime, prevCutoffTime,
      isCurrentRangeToday: isRangeIncludesToday
    });
    curVal = res.currentVal;
    prevVal = res.previousVal;
    curMeta = res.currentMeta;
    prevMeta = res.previousMeta;
  } else {
    // Basic fallback if needed, but queryFn is preferred for flexibility
    return { error: 'queryFn required' };
  }

  const diff = curVal - prevVal;
  const diff_pct = prevVal > 0 ? (diff / prevVal) * 100 : (curVal > 0 ? 100 : 0);
  const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';

  return {
    metric: metricName,
    range: { start: rangeStart, end: rangeEnd },
    current: curMeta !== null ? curMeta : curVal,
    previous: prevMeta !== null ? prevMeta : prevVal,
    diff_pct,
    direction,
    align: 'hour',
    hour: targetHour,
    cutoff_time: cutoffTime
  };
}


async function computeAOV({ start, end, conn, filters }) {
  const total_sales = await computeTotalSales({ start, end, conn, filters });
  const total_orders = await computeTotalOrders({ start, end, conn, filters });
  const numerator = total_sales;
  const aov = total_orders > 0 ? numerator / total_orders : 0;
  return { total_sales, total_orders, aov };
}

async function computeCVR({ start, end, conn, filters }) {
  const total_orders = await computeTotalOrders({ start, end, conn, filters }); // Use computeTotalOrders to respect filters
  const total_sessions = await computeTotalSessions({ start, end, conn, filters }); // Use new helper
  const cvr = total_sessions > 0 ? total_orders / total_sessions : 0;
  return { total_orders, total_sessions, cvr, cvr_percent: cvr * 100 };
}

async function computeCVRForDay(date, conn, filters = {}) {
  if (!date) return { total_orders: 0, total_sessions: 0, cvr: 0, cvr_percent: 0 };
  return computeCVR({ start: date, end: date, conn, filters });
}

async function computeTotalSales({ start, end, conn, filters }) {
  if (hasUtmFilters(filters)) {
    const { where, params } = buildShopifyOrdersWhere(start, end, filters);
    const sql = `SELECT COALESCE(SUM(total_price), 0) AS total FROM shopify_orders ${where}`;
    const rows = await conn.query(sql, { type: QueryTypes.SELECT, replacements: params });
    return Number(rows[0]?.total || 0);
  }
  return rawSum("total_sales", { start, end, conn });
}

async function computeTotalOrders({ start, end, conn, filters }) {
  if (hasUtmFilters(filters)) {
    const { where, params } = buildShopifyOrdersWhere(start, end, filters);
    const sql = `SELECT COUNT(DISTINCT order_name) AS total FROM shopify_orders ${where}`;
    const rows = await conn.query(sql, { type: QueryTypes.SELECT, replacements: params });
    return Number(rows[0]?.total || 0);
  }
  return rawSum("total_orders", { start, end, conn });
}

async function computeTotalSessions({ start, end, conn, filters }) {
  if (hasUtmFilters(filters)) {
    return computeSessionsFromSnapshot({ start, end, conn, filters, column: 'sessions' });
  }
  return rawSum("total_sessions", { start, end, conn });
}

async function computeAtcSessions({ start, end, conn, filters }) {
  if (hasUtmFilters(filters)) {
    return computeSessionsFromSnapshot({ start, end, conn, filters, column: 'sessions_with_cart_additions' });
  }
  return rawSum("total_atc_sessions", { start, end, conn });
}

async function computeSessionsFromSnapshot({ start, end, conn, filters, column }) {
  // Direct query on snapshot with filters
  const snapshotSql = `
    SELECT COALESCE(SUM(${column}), 0) as total
    FROM product_sessions_snapshot
    WHERE date >= ? AND date <= ?
    ${filters.utm_source ? 'AND utm_source = ?' : ''}
    ${filters.utm_medium ? 'AND utm_medium = ?' : ''}
    ${filters.utm_campaign ? 'AND utm_campaign = ?' : ''}
    AND landing_page_type = 'Product'
  `;

  const snapParams = [start, end];
  if (filters.utm_source) snapParams.push(filters.utm_source);
  if (filters.utm_medium) snapParams.push(filters.utm_medium);
  if (filters.utm_campaign) snapParams.push(filters.utm_campaign);

  const snapRows = await conn.query(snapshotSql, { type: QueryTypes.SELECT, replacements: snapParams });
  return Number(snapRows[0]?.total || 0);
}

function hasUtmFilters(filters) {
  if (!filters) return false;
  return !!(filters.utm_source || filters.utm_medium || filters.utm_campaign);
}

function buildShopifyOrdersWhere(start, end, filters) {
  const parts = [];
  const params = [];

  if (start) {
    parts.push("created_date >= ?");
    params.push(start);
  }
  if (end) {
    parts.push("created_date <= ?");
    params.push(end);
  }

  if (filters?.utm_source) {
    parts.push("utm_source = ?");
    params.push(filters.utm_source);
  }
  if (filters?.utm_medium) {
    parts.push("utm_medium = ?");
    params.push(filters.utm_medium);
  }
  if (filters?.utm_campaign) {
    parts.push("utm_campaign = ?");
    params.push(filters.utm_campaign);
  }

  const where = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
  return { where, params };
}

async function computeFunnelStats({ start, end, conn }) {
  const [total_sessions, total_atc_sessions, total_orders] = await Promise.all([
    rawSum("total_sessions", { start, end, conn }),
    rawSum("total_atc_sessions", { start, end, conn }),
    rawSum("total_orders", { start, end, conn }),
  ]);
  return { total_sessions, total_atc_sessions, total_orders };
}

async function sumForDay(column, date, conn) {
  return rawSum(column, { start: date, end: date, conn });
}

async function deltaForSum(column, date, conn) {
  if (!date) return { current: 0, previous: 0, diff_pct: 0, direction: 'flat' };
  const prev = prevDayStr(date);
  const [curr, prevVal] = await Promise.all([
    sumForDay(column, date, conn),
    sumForDay(column, prev, conn)
  ]);
  const diff = curr - prevVal;
  const diff_pct = prevVal > 0 ? (diff / prevVal) * 100 : (curr > 0 ? 100 : 0);
  const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
  return { current: curr, previous: prevVal, diff_pct, direction };
}

async function aovForDay(date, conn) {
  const r = await computeAOV({ start: date, end: date, conn });
  return r.aov || 0;
}

async function deltaForAOV(date, conn) {
  if (!date) return { current: 0, previous: 0, diff_pct: 0, direction: 'flat' };
  const prev = prevDayStr(date);
  const [curr, prevVal] = await Promise.all([
    aovForDay(date, conn),
    aovForDay(prev, conn)
  ]);
  const diff = curr - prevVal;
  const diff_pct = prevVal > 0 ? (diff / prevVal) * 100 : (curr > 0 ? 100 : 0);
  const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
  return { current: curr, previous: prevVal, diff_pct, direction };
}

function computePercentDelta(currentValue, previousValue) {
  const curr = Number(currentValue || 0);
  const prev = Number(previousValue || 0);
  const diff_pp = curr - prev;
  const diff_pct = prev > 0 ? (diff_pp / prev) * 100 : (curr > 0 ? 100 : 0);
  const direction = diff_pp > 0.0001 ? 'up' : diff_pp < -0.0001 ? 'down' : 'flat';
  return { diff_pp, diff_pct, direction };
}

async function avgForRange(column, { start, end, conn }) {
  if (!start || !end) return 0;
  const n = daysInclusive(start, end);
  if (n <= 0) return 0;
  const total = await rawSum(column, { start, end, conn });
  return total / n;
}

async function aovForRange({ start, end, conn, filters }) {
  if (!start || !end) return 0;
  const { total_sales, total_orders } = await computeAOV({ start, end, conn, filters });
  return total_orders > 0 ? total_sales / total_orders : 0;
}

async function cvrForRange({ start, end, conn, filters }) {
  if (!start || !end) return { cvr: 0, cvr_percent: 0 };
  const { total_orders, total_sessions } = await computeCVR({ start, end, conn, filters });
  const cvr = total_sessions > 0 ? total_orders / total_sessions : 0;
  return { cvr, cvr_percent: cvr * 100 };
}

module.exports = {
  rawSum,
  computeMetricDelta,
  computeAOV,
  computeCVR,
  computeCVRForDay,
  computeTotalSales,
  computeTotalOrders,
  computeTotalSessions,
  computeAtcSessions,
  computeFunnelStats,
  sumForDay,
  deltaForSum,
  aovForDay,
  deltaForAOV,
  computePercentDelta,
  avgForRange,
  aovForRange,
  cvrForRange,
  buildShopifyOrdersWhere,
  hasUtmFilters,
};
