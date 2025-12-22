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

function isToday(dateStr) {
  if (!dateStr) return false;
  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  const today = `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
  return dateStr === today;
}

/**
 * Generic helper to compute aligned delta for any metric.
 * queryFn: ({ start, end, cutoffTime, targetHour, prevWin }) => Promise<{ currentVal, previousVal, currentMeta?, previousMeta? }>
 * If queryFn is provided, it handles the DB calls.
 * OR provide `sqlRange` and `sqlOverall` to let this helper run standard queries.
 */
async function computeMetricDelta({ metricName, range, conn, queryFn }) {
  const { start, end } = range;
  const date = end || start;
  const rangeStart = start || date;
  const rangeEnd = end || date;

  const IST_OFFSET_MIN = 330;
  const offsetMs = IST_OFFSET_MIN * 60 * 1000;
  const pad2 = (n) => String(n).padStart(2, '0');
  const nowUtc = new Date();
  const nowIst = new Date(nowUtc.getTime() + offsetMs);
  const yyyy = nowIst.getUTCFullYear();
  const mm = String(nowIst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(nowIst.getUTCDate()).padStart(2, '0');
  const todayIst = `${yyyy}-${mm}-${dd}`;
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
  const effectiveSeconds = Math.min(fullDaySeconds, Math.max(0, resolveSeconds(rangeEnd)));
  const cutoffTime = effectiveSeconds >= fullDaySeconds ? '24:00:00' : secondsToTime(effectiveSeconds);
  const prevWin = previousWindow(rangeStart, rangeEnd);
  const isCurrentRangeToday = isToday(rangeStart) || isToday(rangeEnd);
  const prevCompareHour = isCurrentRangeToday ? Math.max(0, targetHour - 1) : targetHour;
  const prevCutoffSeconds = isCurrentRangeToday ? Math.min(fullDaySeconds, (prevCompareHour + 1) * 3600) : effectiveSeconds;
  const prevCutoffTime = prevCutoffSeconds >= fullDaySeconds ? '24:00:00' : secondsToTime(prevCutoffSeconds);

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
      isCurrentRangeToday 
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


async function computeAOV({ start, end, conn }) {
  const total_sales = await rawSum("total_sales", { start, end, conn });
  const total_orders = await rawSum("total_orders", { start, end, conn });
  const numerator = total_sales;
  const aov = total_orders > 0 ? numerator / total_orders : 0;
  return { total_sales, total_orders, aov };
}

async function computeCVR({ start, end, conn }) {
  const total_orders = await rawSum("total_orders", { start, end, conn });
  const total_sessions = await rawSum("total_sessions", { start, end, conn });
  const cvr = total_sessions > 0 ? total_orders / total_sessions : 0;
  return { total_orders, total_sessions, cvr, cvr_percent: cvr * 100 };
}

async function computeCVRForDay(date, conn) {
  if (!date) return { total_orders: 0, total_sessions: 0, cvr: 0, cvr_percent: 0 };
  return computeCVR({ start: date, end: date, conn });
}

async function computeTotalSales({ start, end, conn }) {
  return rawSum("total_sales", { start, end, conn });
}

async function computeTotalOrders({ start, end, conn }) {
  return rawSum("total_orders", { start, end, conn });
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

async function aovForRange({ start, end, conn }) {
  if (!start || !end) return 0;
  const { total_sales, total_orders } = await computeAOV({ start, end, conn });
  return total_orders > 0 ? total_sales / total_orders : 0;
}

async function cvrForRange({ start, end, conn }) {
  if (!start || !end) return { cvr: 0, cvr_percent: 0 };
  const { total_orders, total_sessions } = await computeCVR({ start, end, conn });
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
  computeFunnelStats,
  sumForDay,
  deltaForSum,
  aovForDay,
  deltaForAOV,
  computePercentDelta,
  avgForRange,
  aovForRange,
  cvrForRange,
};
