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
  if (filters?.device_type) {
    return computeSessionsFromDeviceColumns({ start, end, conn, filters, metric: 'sessions' });
  }
  if (hasUtmFilters(filters)) {
    return computeSessionsFromSnapshot({ start, end, conn, filters, column: 'sessions' });
  }
  return rawSum("total_sessions", { start, end, conn });
}

async function computeAtcSessions({ start, end, conn, filters }) {
  if (filters?.device_type) {
    return computeSessionsFromDeviceColumns({ start, end, conn, filters, metric: 'atc' });
  }
  if (hasUtmFilters(filters)) {
    return computeSessionsFromSnapshot({ start, end, conn, filters, column: 'sessions_with_cart_additions' });
  }
  return rawSum("total_atc_sessions", { start, end, conn });
}

function appendUtmWhere(sql, params, filters, mapDirectToNull = false) {
  if (!filters) return sql;
  const append = (col, val) => {
    if (!val) return;
    const vals = Array.isArray(val) ? val : (typeof val === 'string' && val.includes(',') ? val.split(',') : [val]);
    const cleanVals = vals.map(v => v.trim()).filter(Boolean);
    if (cleanVals.length === 0) return;

    // Special handling for 'direct' in snapshot tables (where it is NULL)
    if (mapDirectToNull && col === 'utm_source') {
      const hasDirect = cleanVals.some(v => v.toLowerCase() === 'direct');
      const otherVals = cleanVals.filter(v => v.toLowerCase() !== 'direct');

      if (hasDirect) {
        if (otherVals.length === 0) {
          // Only direct
          sql += ` AND ${col} IS NULL`;
        } else {
          // Mixed
          sql += ` AND (${col} IN (${otherVals.map(() => '?').join(', ')}) OR ${col} IS NULL)`;
          params.push(...otherVals);
        }
        return;
      }
    }

    if (cleanVals.length === 1) {
      sql += ` AND ${col} = ?`;
      params.push(cleanVals[0]);
    } else {
      sql += ` AND ${col} IN (${cleanVals.map(() => '?').join(', ')})`;
      params.push(...cleanVals);
    }
  };
  append('utm_source', filters.utm_source);
  append('utm_medium', filters.utm_medium);
  append('utm_campaign', filters.utm_campaign);
  append('utm_term', filters.utm_term);
  append('utm_content', filters.utm_content);
  append('order_app_name', filters.sales_channel);
  // Device type filter on user_agent
  const dtClause = buildDeviceTypeUserAgentClause(filters.device_type);
  if (dtClause) {
    sql += ` AND (${dtClause})`;
  }
  return sql;
}

async function computeSessionsFromSnapshot({ start, end, conn, filters, column }) {
  // Direct query on snapshot with filters
  let snapshotSql = `
    SELECT COALESCE(SUM(${column}), 0) as total
    FROM product_sessions_snapshot
    WHERE date >= ? AND date <= ?
  `;

  const snapParams = [start, end];

  // Use shared helper, but exclude sales_channel (order_app_name) as it doesn't exist in snapshot
  const { sales_channel, ...filtersForSnapshot } = filters || {};
  // Pass true to map 'direct' -> NULL for snapshot tables
  snapshotSql = appendUtmWhere(snapshotSql, snapParams, filtersForSnapshot, true);

  const snapRows = await conn.query(snapshotSql, { type: QueryTypes.SELECT, replacements: snapParams });
  return Number(snapRows[0]?.total || 0);
}

function hasUtmFilters(filters) {
  if (!filters) return false;
  return !!(
    filters.utm_source ||
    filters.utm_medium ||
    filters.utm_campaign ||
    filters.utm_term ||
    filters.utm_content ||
    filters.sales_channel ||
    filters.device_type
  );
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

  // Allow multi-select using helper logic, but we need to adapt since this builds parts array
  // instead of appending to SQL string.
  // actually we can just build the base string and then use the helper if we change the signature
  // BUT to keep it compatible let's just do it inline here or adapt helper.

  // Let's just implement the multi-select logic here for parts/params structure
  const add = (col, val) => {
    if (!val) return;
    const vals = Array.isArray(val) ? val : (typeof val === 'string' && val.includes(',') ? val.split(',') : [val]);
    if (vals.length === 0) return;

    if (vals.length === 1) {
      parts.push(`${col} = ?`);
      params.push(vals[0].trim());
    } else {
      parts.push(`${col} IN (${vals.map(() => '?').join(', ')})`);
      params.push(...vals.map(v => v.trim()));
    }
  };

  if (filters) {
    add('utm_source', filters.utm_source);
    add('utm_medium', filters.utm_medium);
    add('utm_campaign', filters.utm_campaign);
    add('utm_term', filters.utm_term);
    add('utm_content', filters.utm_content);
    add('order_app_name', filters.sales_channel);
    // Device type filter on user_agent
    const dtClause = buildDeviceTypeUserAgentClause(filters.device_type);
    if (dtClause) {
      parts.push(`(${dtClause})`);
    }
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

/**
 * Build a SQL clause for device_type filter on user_agent column.
 * @param {string|string[]|null} deviceType - e.g. ['Desktop','Mobile'] or 'Desktop'
 * @returns {string|null} SQL snippet like "(user_agent LIKE '%Windows%')" or null
 */
function buildDeviceTypeUserAgentClause(deviceType) {
  if (!deviceType) return null;
  const types = Array.isArray(deviceType) ? deviceType : [deviceType];
  if (types.length === 0) return null;

  const clauses = [];
  for (const t of types) {
    const lower = (t || '').toString().toLowerCase().trim();
    if (lower === 'desktop') {
      clauses.push("user_agent LIKE '%Windows%'");
    } else if (lower === 'mobile') {
      clauses.push("(user_agent LIKE '%Android%' OR user_agent LIKE '%iPhone%')");
    } else if (lower === 'others') {
      clauses.push("(user_agent NOT LIKE '%Windows%' AND user_agent NOT LIKE '%Android%' AND user_agent NOT LIKE '%iPhone%')");
    }
  }
  if (clauses.length === 0) return null;
  return clauses.join(' OR ');
}

/**
 * Query device-specific session/atc columns from hourly_sessions_summary_shopify.
 * Mobile = mobile + tablet columns.
 */
async function computeSessionsFromDeviceColumns({ start, end, conn, filters, metric }) {
  const types = Array.isArray(filters.device_type) ? filters.device_type : [filters.device_type];
  const cols = [];
  for (const t of types) {
    const lower = (t || '').toString().toLowerCase().trim();
    if (lower === 'desktop') {
      cols.push(metric === 'atc' ? 'desktop_atc_sessions' : 'desktop_sessions');
    } else if (lower === 'mobile') {
      cols.push(metric === 'atc' ? 'mobile_atc_sessions' : 'mobile_sessions');
      cols.push(metric === 'atc' ? 'tablet_atc_sessions' : 'tablet_sessions');
    } else if (lower === 'others') {
      cols.push(metric === 'atc' ? 'other_atc_sessions' : 'other_sessions');
    }
  }
  if (cols.length === 0) {
    // Fallback to total
    const totalCol = metric === 'atc' ? 'number_of_atc_sessions' : 'COALESCE(adjusted_number_of_sessions, number_of_sessions)';
    cols.push(totalCol);
  }
  const sumExpr = cols.map(c => `COALESCE(${c}, 0)`).join(' + ');
  const sql = `SELECT COALESCE(SUM(${sumExpr}), 0) AS total FROM hourly_sessions_summary_shopify WHERE date >= ? AND date <= ?`;
  const rows = await conn.query(sql, { type: QueryTypes.SELECT, replacements: [start, end] });
  return Number(rows[0]?.total || 0);
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
  appendUtmWhere,
  extractUtmParam,
  buildDeviceTypeUserAgentClause,
  computeSessionsFromDeviceColumns,
  extractFilters,
};

function extractUtmParam(val) {
  if (!val) return null;
  if (Array.isArray(val)) return val.filter(v => v);
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.includes(',')) return trimmed.split(',').map(v => v.trim()).filter(Boolean);
    return trimmed || null;
  }
  return null;
}

/**
 * Extracts filters from the request query.
 * If the date range (start to end) exceeds 30 days, UTM parameters are ignored
 * to prevent heavy queries from timing out the database.
 */
function extractFilters(req) {
  const { start, end, utm_source, utm_medium, utm_campaign, utm_term, utm_content, sales_channel, device_type, product_id } = req.query;

  let ignoreUtms = false;
  if (start && end) {
    const numDays = daysInclusive(start, end);
    if (numDays > 30) {
      ignoreUtms = true;
    }
  }

  return {
    utm_source: ignoreUtms ? null : extractUtmParam(utm_source),
    utm_medium: ignoreUtms ? null : extractUtmParam(utm_medium),
    utm_campaign: ignoreUtms ? null : extractUtmParam(utm_campaign),
    utm_term: ignoreUtms ? null : extractUtmParam(utm_term),
    utm_content: ignoreUtms ? null : extractUtmParam(utm_content),
    sales_channel: extractUtmParam(sales_channel),
    device_type: extractUtmParam(device_type),
    product_id: extractUtmParam(product_id),
  };
}
