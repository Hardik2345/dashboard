const { QueryTypes } = require('sequelize');
const redisClient = require('../lib/redis');
const { RangeSchema, isoDate } = require('../validation/schemas');
const { computeAOV, computeCVR, computeCVRForDay, computeTotalSales, computeTotalOrders, computeFunnelStats, deltaForSum, deltaForAOV, computePercentDelta, avgForRange, aovForRange, cvrForRange, rawSum, computeMetricDelta } = require('../utils/metricsUtils');
const { previousWindow, prevDayStr, parseIsoDate, formatIsoDate, shiftDays } = require('../utils/dateUtils');
const { requireBrandKey } = require('../utils/brandHelpers');
const { getBrandConnection } = require('../lib/brandConnectionManager');
const { getBrands } = require('../config/brands');

const SHOP_DOMAIN_CACHE = new Map();
const pad2 = (n) => String(n).padStart(2, '0');
const MEM_CACHE = new Map();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds
const IST_OFFSET_MIN = 330;

async function calcTotalOrdersDelta({ start, end, align, compare, conn }) {
  const date = end || start;
  if (!date && !(start && end)) {
    return { metric: 'TOTAL_ORDERS_DELTA', date: null, current: null, previous: null, diff_pct: 0, direction: 'flat' };
  }

  if (align === 'hour') {
    const rangeStart = start || date;
    const rangeEnd = end || date;
    if (!rangeStart || !rangeEnd) return { error: 'Invalid date range' };

    const pad2 = (n) => String(n).padStart(2, '0');
    const nowUtc = new Date();
    const nowIstMs = nowUtc.getTime() + (IST_OFFSET_MIN * 60 * 1000);
    const nowIst = new Date(nowIstMs);
    const todayIst = `${nowIst.getUTCFullYear()}-${pad2(nowIst.getUTCMonth() + 1)}-${pad2(nowIst.getUTCDate())}`;
    const secondsNow = (nowIst.getUTCHours() * 3600) + (nowIst.getUTCMinutes() * 60) + (nowIst.getUTCSeconds());
    const fullDaySeconds = 24 * 3600;
    const resolveSeconds = (targetDate) => (targetDate === todayIst ? secondsNow : fullDaySeconds);
    const effectiveSeconds = Math.min(fullDaySeconds, Math.max(0, resolveSeconds(rangeEnd)));

    const secondsToTime = (secs) => {
      const hh = Math.floor(secs / 3600);
      const mm = Math.floor((secs % 3600) / 60);
      const ss = secs % 60;
      return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
    };

    const cutoffTime = effectiveSeconds >= fullDaySeconds ? '24:00:00' : secondsToTime(effectiveSeconds);
    const rangeFilter = `created_dt >= ? AND created_dt <= ? AND created_time < ?`;
    const prevWin = previousWindow(rangeStart, rangeEnd);
    const countSql = `SELECT COUNT(DISTINCT order_name) AS cnt FROM shopify_orders WHERE ${rangeFilter}`;
    const currPromise = conn.query(countSql, { type: QueryTypes.SELECT, replacements: [rangeStart, rangeEnd, cutoffTime] });
    const prevPromise = prevWin ? conn.query(countSql, { type: QueryTypes.SELECT, replacements: [prevWin.prevStart, prevWin.prevEnd, cutoffTime] }) : Promise.resolve([{ cnt: 0 }]);
    const [currRows, prevRows] = await Promise.all([currPromise, prevPromise]);
    const current = Number(currRows?.[0]?.cnt || 0);
    const previous = Number(prevRows?.[0]?.cnt || 0);
    const diff = current - previous;
    const diff_pct = previous > 0 ? (diff / previous) * 100 : (current > 0 ? 100 : 0);
    const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
    return start && end
      ? { metric: 'TOTAL_ORDERS_DELTA', range: { start, end }, current, previous, diff_pct, direction, align: 'hour', cutoff_time: cutoffTime }
      : { metric: 'TOTAL_ORDERS_DELTA', date: rangeEnd, current, previous, diff_pct, direction, align: 'hour', cutoff_time: cutoffTime };
  }

  if (!date) return { metric: 'TOTAL_ORDERS_DELTA', date: null, current: null, previous: null, diff_pct: 0, direction: 'flat' };
  const delta = await deltaForSum('total_orders', date, conn);
  return { metric: 'TOTAL_ORDERS_DELTA', date, ...delta };
}

async function calcTotalSalesDelta({ start, end, align, compare, conn }) {
  const date = end || start;
  if (!date && !(start && end)) return { metric: 'TOTAL_SALES_DELTA', date: null, current: null, previous: null, diff_pct: 0, direction: 'flat' };

  if (compare === 'prev-range-avg' && start && end) {
    const currAvg = await avgForRange('total_sales', { start, end, conn });
    const prevWin = previousWindow(start, end);
    const prevAvg = await avgForRange('total_sales', { start: prevWin.prevStart, end: prevWin.prevEnd, conn });
    const diff = currAvg - prevAvg;
    const diff_pct = prevAvg > 0 ? (diff / prevAvg) * 100 : (currAvg > 0 ? 100 : 0);
    const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
    return { metric: 'TOTAL_SALES_DELTA', range: { start, end }, current: currAvg, previous: prevAvg, diff_pct, direction, compare: 'prev-range-avg' };
  }

  if (align === 'hour') {
    const rangeStart = start || date;
    const rangeEnd = end || date;
    if (!rangeStart || !rangeEnd) return { error: 'Invalid date range' };

    const pad2 = (n) => String(n).padStart(2, '0');
    const nowUtc = new Date();
    const nowIst = new Date(nowUtc.getTime() + IST_OFFSET_MIN * 60 * 1000);
    const todayIst = `${nowIst.getUTCFullYear()}-${pad2(nowIst.getUTCMonth() + 1)}-${pad2(nowIst.getUTCDate())}`;
    const secondsNow = (nowIst.getUTCHours() * 3600) + (nowIst.getUTCMinutes() * 60) + (nowIst.getUTCSeconds());
    const fullDaySeconds = 24 * 3600;
    const resolveSeconds = (targetDate) => (targetDate === todayIst ? secondsNow : fullDaySeconds);
    const effectiveSeconds = Math.min(fullDaySeconds, Math.max(0, resolveSeconds(rangeEnd)));
    const cutoffTime = effectiveSeconds >= fullDaySeconds ? '24:00:00' : `${pad2(Math.floor(effectiveSeconds / 3600))}:${pad2(Math.floor((effectiveSeconds % 3600) / 60))}:${pad2(effectiveSeconds % 60)}`;
    const prevWin = previousWindow(rangeStart, rangeEnd);
    const salesSql = `SELECT COALESCE(SUM(total_price),0) AS total FROM shopify_orders WHERE created_dt >= ? AND created_dt <= ? AND created_time < ?`;
    const currentPromise = conn.query(salesSql, { type: QueryTypes.SELECT, replacements: [rangeStart, rangeEnd, cutoffTime] });
    const previousPromise = prevWin ? conn.query(salesSql, { type: QueryTypes.SELECT, replacements: [prevWin.prevStart, prevWin.prevEnd, cutoffTime] }) : Promise.resolve([{ total: 0 }]);
    const [currRow, prevRow] = await Promise.all([currentPromise, previousPromise]);
    const curr = Number(currRow?.[0]?.total || 0);
    const prevVal = Number(prevRow?.[0]?.total || 0);
    const diff = curr - prevVal;
    const diff_pct = prevVal > 0 ? (diff / prevVal) * 100 : (curr > 0 ? 100 : 0);
    const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
    return start && end
      ? { metric: 'TOTAL_SALES_DELTA', range: { start, end }, current: curr, previous: prevVal, diff_pct, direction, align: 'hour', cutoff_time: cutoffTime }
      : { metric: 'TOTAL_SALES_DELTA', date: rangeEnd, current: curr, previous: prevVal, diff_pct, direction, align: 'hour', cutoff_time: cutoffTime };
  }

  const delta = await deltaForSum('total_sales', date, conn);
  return { metric: 'TOTAL_SALES_DELTA', date, ...delta };
}

async function calcTotalSessionsDelta({ start, end, align, compare, conn }) {
  const date = end || start;
  if (!date && !(start && end)) return { metric: 'TOTAL_SESSIONS_DELTA', date: null, current: null, previous: null, diff_pct: 0, direction: 'flat' };

  if (compare === 'prev-range-avg' && start && end) {
    const currAvg = await avgForRange('total_sessions', { start, end, conn });
    const prevWin = previousWindow(start, end);
    const prevAvg = await avgForRange('total_sessions', { start: prevWin.prevStart, end: prevWin.prevEnd, conn });
    const diff = currAvg - prevAvg;
    const diff_pct = prevAvg > 0 ? (diff / prevAvg) * 100 : (currAvg > 0 ? 100 : 0);
    const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
    return { metric: 'TOTAL_SESSIONS_DELTA', range: { start, end }, current: currAvg, previous: prevAvg, diff_pct, direction, compare: 'prev-range-avg' };
  }

  const alignLower = (align || '').toString().toLowerCase();
  if (alignLower === 'hour') {
    const nowUtc = new Date();
    const nowIst = new Date(nowUtc.getTime() + IST_OFFSET_MIN * 60 * 1000);
    const yyyy = nowIst.getUTCFullYear();
    const mm = String(nowIst.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(nowIst.getUTCDate()).padStart(2, '0');
    const todayIst = `${yyyy}-${mm}-${dd}`;
    const resolveTargetHour = (endOrDate) => (endOrDate === todayIst ? nowIst.getUTCHours() : 23);

    if (start && end) {
      const targetHour = resolveTargetHour(end);
      const prevWin = previousWindow(start, end);
      const isCurrentRangeToday = isToday(start) || isToday(end);
      const prevCompareHour = isCurrentRangeToday ? Math.max(0, targetHour - 1) : targetHour;
      const sqlRange = `SELECT COALESCE(SUM(COALESCE(adjusted_number_of_sessions, number_of_sessions)),0) AS total FROM hourly_sessions_summary_shopify WHERE date >= ? AND date <= ? AND hour <= ?`;
      const sqlOverallSessions = `SELECT COALESCE(SUM(total_sessions),0) AS total FROM overall_summary WHERE date >= ? AND date <= ?`;
      const [currRow, prevRow, overallCurrRow] = await Promise.all([
        conn.query(sqlRange, { type: QueryTypes.SELECT, replacements: [start, end, targetHour] }),
        conn.query(sqlRange, { type: QueryTypes.SELECT, replacements: [prevWin.prevStart, prevWin.prevEnd, prevCompareHour] }),
        isCurrentRangeToday ? conn.query(sqlOverallSessions, { type: QueryTypes.SELECT, replacements: [start, end] }) : Promise.resolve(null),
      ]);
      let curr = Number(currRow?.[0]?.total || 0);
      if (overallCurrRow) {
        curr = Number(overallCurrRow?.[0]?.total || 0);
      }
      const prevVal = Number(prevRow?.[0]?.total || 0);
      const diff = curr - prevVal;
      const diff_pct = prevVal > 0 ? (diff / prevVal) * 100 : (curr > 0 ? 100 : 0);
      const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
      return { metric: 'TOTAL_SESSIONS_DELTA', range: { start, end }, current: curr, previous: prevVal, diff_pct, direction, align: 'hour', hour: targetHour };
    } else {
      const targetHour = resolveTargetHour(date);
      const prev = prevDayStr(date);
      const isCurrentToday = isToday(date);
      const prevCompareHour = isCurrentToday ? Math.max(0, targetHour - 1) : targetHour;
      const sql = `SELECT COALESCE(SUM(COALESCE(adjusted_number_of_sessions, number_of_sessions)),0) AS total FROM hourly_sessions_summary_shopify WHERE date = ? AND hour <= ?`;
      const sqlOverallSessions = `SELECT COALESCE(SUM(total_sessions),0) AS total FROM overall_summary WHERE date = ?`;
      const [currRow, prevRow, overallCurrRow] = await Promise.all([
        conn.query(sql, { type: QueryTypes.SELECT, replacements: [date, targetHour] }),
        conn.query(sql, { type: QueryTypes.SELECT, replacements: [prev, prevCompareHour] }),
        isCurrentToday ? conn.query(sqlOverallSessions, { type: QueryTypes.SELECT, replacements: [date] }) : Promise.resolve(null),
      ]);
      let curr = Number(currRow?.[0]?.total || 0);
      if (overallCurrRow) {
        curr = Number(overallCurrRow?.[0]?.total || 0);
      }
      const prevVal = Number(prevRow?.[0]?.total || 0);
      const diff = curr - prevVal;
      const diff_pct = prevVal > 0 ? (diff / prevVal) * 100 : (curr > 0 ? 100 : 0);
      const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
      return { metric: 'TOTAL_SESSIONS_DELTA', date, current: curr, previous: prevVal, diff_pct, direction, align: 'hour', hour: targetHour };
    }
  }

  const d = await deltaForSum('total_sessions', date, conn);
  return { metric: 'TOTAL_SESSIONS_DELTA', date, ...d };
}

async function calcAtcSessionsDelta({ start, end, align, compare, conn }) {
  const date = end || start;
  if (!date && !(start && end)) return { metric: 'ATC_SESSIONS_DELTA', date: null, current: null, previous: null, diff_pct: 0, direction: 'flat' };

  if (compare === 'prev-range-avg' && start && end) {
    const currAvg = await avgForRange('total_atc_sessions', { start, end, conn });
    const prevWin = previousWindow(start, end);
    const prevAvg = await avgForRange('total_atc_sessions', { start: prevWin.prevStart, end: prevWin.prevEnd, conn });
    const diff = currAvg - prevAvg;
    const diff_pct = prevAvg > 0 ? (diff / prevAvg) * 100 : (currAvg > 0 ? 100 : 0);
    const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
    return { metric: 'ATC_SESSIONS_DELTA', range: { start, end }, current: currAvg, previous: prevAvg, diff_pct, direction, compare: 'prev-range-avg' };
  }

  if ((align || '').toString().toLowerCase() === 'hour') {
    const nowUtc = new Date();
    const nowIst = new Date(nowUtc.getTime() + IST_OFFSET_MIN * 60 * 1000);
    const yyyy = nowIst.getUTCFullYear();
    const mm = String(nowIst.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(nowIst.getUTCDate()).padStart(2, '0');
    const todayIst = `${yyyy}-${mm}-${dd}`;
    const resolveTargetHour = (endOrDate) => (endOrDate === todayIst ? nowIst.getUTCHours() : 23);

    if (start && end) {
      const targetHour = resolveTargetHour(end);
      const prevWin = previousWindow(start, end);
      const isCurrentRangeToday = isToday(start) || isToday(end);
      const prevCompareHour = isCurrentRangeToday ? Math.max(0, targetHour - 1) : targetHour;
      const sqlRange = `SELECT COALESCE(SUM(number_of_atc_sessions),0) AS total FROM hourly_sessions_summary_shopify WHERE date >= ? AND date <= ? AND hour <= ?`;
      const sqlOverallAtc = `SELECT COALESCE(SUM(total_atc_sessions),0) AS total FROM overall_summary WHERE date >= ? AND date <= ?`;
      const [currRow, prevRow, overallCurrRow] = await Promise.all([
        conn.query(sqlRange, { type: QueryTypes.SELECT, replacements: [start, end, targetHour] }),
        conn.query(sqlRange, { type: QueryTypes.SELECT, replacements: [prevWin.prevStart, prevWin.prevEnd, prevCompareHour] }),
        isCurrentRangeToday ? conn.query(sqlOverallAtc, { type: QueryTypes.SELECT, replacements: [start, end] }) : Promise.resolve(null),
      ]);
      let curr = Number(currRow?.[0]?.total || 0);
      if (overallCurrRow) {
        curr = Number(overallCurrRow?.[0]?.total || 0);
      }
      const prevVal = Number(prevRow?.[0]?.total || 0);
      const diff = curr - prevVal;
      const diff_pct = prevVal > 0 ? (diff / prevVal) * 100 : (curr > 0 ? 100 : 0);
      const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
      return { metric: 'ATC_SESSIONS_DELTA', range: { start, end }, current: curr, previous: prevVal, diff_pct, direction, align: 'hour', hour: targetHour };
    } else {
      const targetHour = resolveTargetHour(date);
      const prev = prevDayStr(date);
      const isCurrentToday = isToday(date);
      const prevCompareHour = isCurrentToday ? Math.max(0, targetHour - 1) : targetHour;
      const sql = `SELECT COALESCE(SUM(number_of_atc_sessions),0) AS total FROM hourly_sessions_summary_shopify WHERE date = ? AND hour <= ?`;
      const sqlOverallAtc = `SELECT COALESCE(SUM(total_atc_sessions),0) AS total FROM overall_summary WHERE date = ?`;
      const [currRow, prevRow, overallCurrRow] = await Promise.all([
        conn.query(sql, { type: QueryTypes.SELECT, replacements: [date, targetHour] }),
        conn.query(sql, { type: QueryTypes.SELECT, replacements: [prev, prevCompareHour] }),
        isCurrentToday ? conn.query(sqlOverallAtc, { type: QueryTypes.SELECT, replacements: [date] }) : Promise.resolve(null),
      ]);
      let curr = Number(currRow?.[0]?.total || 0);
      if (overallCurrRow) {
        curr = Number(overallCurrRow?.[0]?.total || 0);
      }
      const prevVal = Number(prevRow?.[0]?.total || 0);
      const diff = curr - prevVal;
      const diff_pct = prevVal > 0 ? (diff / prevVal) * 100 : (curr > 0 ? 100 : 0);
      const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
      return { metric: 'ATC_SESSIONS_DELTA', date, current: curr, previous: prevVal, diff_pct, direction, align: 'hour', hour: targetHour };
    }
  }

  const d = await deltaForSum('total_atc_sessions', date, conn);
  return { metric: 'ATC_SESSIONS_DELTA', date, ...d };
}

async function calcAovDelta({ start, end, align, compare, conn, debug }) {
  const date = end || start;
  if (!date && !(start && end)) return { metric: 'AOV_DELTA', date: null, current: null, previous: null, diff_pct: 0, direction: 'flat' };

  if ((compare || '').toString().toLowerCase() === 'prev-range-avg' && start && end) {
    const curr = await aovForRange({ start, end, conn });
    const prevWin = previousWindow(start, end);
    const prev = await aovForRange({ start: prevWin.prevStart, end: prevWin.prevEnd, conn });
    const diff = curr - prev;
    const diff_pct = prev > 0 ? (diff / prev) * 100 : (curr > 0 ? 100 : 0);
    const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
    return { metric: 'AOV_DELTA', range: { start, end }, current: curr, previous: prev, diff_pct, direction, compare: 'prev-range-avg' };
  }

  if ((align || '').toString().toLowerCase() === 'hour') {
    const offsetMs = IST_OFFSET_MIN * 60 * 1000;
    const nowUtc = new Date();
    const nowIst = new Date(nowUtc.getTime() + offsetMs);
    const pad2 = (n) => String(n).padStart(2, '0');
    const todayIst = `${nowIst.getUTCFullYear()}-${pad2(nowIst.getUTCMonth() + 1)}-${pad2(nowIst.getUTCDate())}`;
    const resolveTargetHour = (endOrDate) => (endOrDate === todayIst ? nowIst.getUTCHours() : 23);
    const secondsNow = (nowIst.getUTCHours() * 3600) + (nowIst.getUTCMinutes() * 60) + (nowIst.getUTCSeconds());
    const fullDaySeconds = 24 * 3600;
    const resolveSeconds = (targetDate) => (targetDate === todayIst ? secondsNow : fullDaySeconds);
    const secondsToTime = (secs) => `${pad2(Math.floor(secs / 3600))}:${pad2(Math.floor((secs % 3600) / 60))}:${pad2(secs % 60)}`;
    const salesSqlRange = `SELECT COALESCE(SUM(total_price),0) AS total FROM shopify_orders WHERE created_dt >= ? AND created_dt <= ? AND created_time < ?`;
    const salesSql = `SELECT COALESCE(SUM(total_price),0) AS total FROM shopify_orders WHERE created_dt >= ? AND created_dt <= ? AND created_time < ?`;
    const ordersSqlRange = `SELECT COUNT(DISTINCT order_name) AS cnt FROM shopify_orders WHERE created_dt >= ? AND created_dt <= ? AND created_time < ?`;
    const ordersSql = `SELECT COUNT(DISTINCT order_name) AS cnt FROM shopify_orders WHERE created_dt >= ? AND created_dt <= ? AND created_time < ?`;

    if (start && end) {
      const targetHour = resolveTargetHour(end);
      const effectiveSeconds = Math.min(fullDaySeconds, Math.max(0, resolveSeconds(end)));
      const cutoffTime = effectiveSeconds >= fullDaySeconds ? '24:00:00' : secondsToTime(effectiveSeconds);
      const prevWin = previousWindow(start, end);

      const [salesCurRows, salesPrevRows, ordersCurRows, ordersPrevRows] = await Promise.all([
        conn.query(salesSqlRange, { type: QueryTypes.SELECT, replacements: [start, end, cutoffTime] }),
        conn.query(salesSqlRange, { type: QueryTypes.SELECT, replacements: [prevWin.prevStart, prevWin.prevEnd, cutoffTime] }),
        conn.query(ordersSqlRange, { type: QueryTypes.SELECT, replacements: [start, end, cutoffTime] }),
        conn.query(ordersSqlRange, { type: QueryTypes.SELECT, replacements: [prevWin.prevStart, prevWin.prevEnd, cutoffTime] }),
      ]);

      const curSales = Number(salesCurRows?.[0]?.total || 0);
      const prevSales = Number(salesPrevRows?.[0]?.total || 0);
      const curOrders = Number(ordersCurRows?.[0]?.cnt || 0);
      const prevOrders = Number(ordersPrevRows?.[0]?.cnt || 0);

      const curAov = curOrders > 0 ? curSales / curOrders : 0;
      const prevAov = prevOrders > 0 ? prevSales / prevOrders : 0;
      const diff = curAov - prevAov;
      const diff_pct = prevAov > 0 ? (diff / prevAov) * 100 : (curAov > 0 ? 100 : 0);
      const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
      const resp = { metric: 'AOV_DELTA', range: { start, end }, current: curAov, previous: prevAov, diff_pct, direction, align: 'hour', hour: targetHour, cutoff_time: cutoffTime };
      if (debug) {
        resp.sales = { current: curSales, previous: prevSales };
        resp.orders = { current: curOrders, previous: prevOrders };
      }
      return resp;
    }

    const targetHour = resolveTargetHour(date);
    const effectiveSeconds = Math.min(fullDaySeconds, Math.max(0, resolveSeconds(date)));
    const cutoffTime = effectiveSeconds >= fullDaySeconds ? '24:00:00' : secondsToTime(effectiveSeconds);
    const prev = prevDayStr(date);

    const [salesCurRows, salesPrevRows, ordersCurRows, ordersPrevRows] = await Promise.all([
      conn.query(salesSql, { type: QueryTypes.SELECT, replacements: [date, date, cutoffTime] }),
      conn.query(salesSql, { type: QueryTypes.SELECT, replacements: [prev, prev, cutoffTime] }),
      conn.query(ordersSql, { type: QueryTypes.SELECT, replacements: [date, date, cutoffTime] }),
      conn.query(ordersSql, { type: QueryTypes.SELECT, replacements: [prev, prev, cutoffTime] }),
    ]);

    const curSales = Number(salesCurRows?.[0]?.total || 0);
    const prevSales = Number(salesPrevRows?.[0]?.total || 0);
    const curOrders = Number(ordersCurRows?.[0]?.cnt || 0);
    const prevOrders = Number(ordersPrevRows?.[0]?.cnt || 0);

    const curAov = curOrders > 0 ? curSales / curOrders : 0;
    const prevAov = prevOrders > 0 ? prevSales / prevOrders : 0;
    const diff = curAov - prevAov;
    const diff_pct = prevAov > 0 ? (diff / prevAov) * 100 : (curAov > 0 ? 100 : 0);
    const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
    const resp = { metric: 'AOV_DELTA', date, current: curAov, previous: prevAov, diff_pct, direction, align: 'hour', hour: targetHour, cutoff_time: cutoffTime };
    if (debug) {
      resp.sales = { current: curSales, previous: prevSales };
      resp.orders = { current: curOrders, previous: prevOrders };
    }
    return resp;
  }

  const d = await deltaForAOV(date, conn);
  return { metric: 'AOV_DELTA', date, ...d };
}

async function calcCvrDelta({ start, end, align, compare, conn }) {
  const date = end || start;
  const target = end || start;
  if (!target && !(start && end)) {
    return { metric: 'CVR_DELTA', date: null, current: null, previous: null, diff_pp: 0, diff_pct: 0, direction: 'flat' };
  }

  const alignLower = (align || '').toString().toLowerCase();
  const compareLower = (compare || '').toString().toLowerCase();

  if (compareLower === 'prev-range-avg' && start && end) {
    const curr = await cvrForRange({ start, end, conn });
    const prevWin = previousWindow(start, end);
    const prev = await cvrForRange({ start: prevWin.prevStart, end: prevWin.prevEnd, conn });
    const delta = computePercentDelta(curr.cvr_percent || 0, prev.cvr_percent || 0);
    return { metric: 'CVR_DELTA', range: { start, end }, current: curr, previous: prev, diff_pp: delta.diff_pp, diff_pct: delta.diff_pct, direction: delta.direction, compare: 'prev-range-avg' };
  }

  const base = new Date(`${target}T00:00:00Z`);
  const prev = new Date(base.getTime() - 24 * 3600_000);
  const prevStr = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth()+1).padStart(2,'0')}-${String(prev.getUTCDate()).padStart(2,'0')}`;

  if (alignLower === 'hour') {
    const offsetMs = IST_OFFSET_MIN * 60 * 1000;
    const pad2Local = (n) => String(n).padStart(2, '0');
    const nowUtc = new Date();
    const nowIst = new Date(nowUtc.getTime() + offsetMs);
    const yyyy = nowIst.getUTCFullYear();
    const mm = String(nowIst.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(nowIst.getUTCDate() + 0).padStart(2, '0');
    const todayIst = `${yyyy}-${mm}-${dd}`;
    const resolveTargetHour = (endOrDate) => (endOrDate === todayIst ? nowIst.getUTCHours() : 23);
    const secondsNow = (nowIst.getUTCHours() * 3600) + (nowIst.getUTCMinutes() * 60) + nowIst.getUTCSeconds();
    const fullDaySeconds = 24 * 3600;
    const resolveSeconds = (targetDate) => (targetDate === todayIst ? secondsNow : fullDaySeconds);
    const secondsToTime = (secs) => {
      const hh = Math.floor(secs / 3600);
      const mm2 = Math.floor((secs % 3600) / 60);
      const ss = secs % 60;
      return `${pad2Local(hh)}:${pad2Local(mm2)}:${pad2Local(ss)}`;
    };

    if (start && end) {
      const rangeStart = start;
      const rangeEnd = end;
      const targetHour = resolveTargetHour ? resolveTargetHour(end) : (end === todayIst ? nowIst.getUTCHours() : 23);
      const effectiveSeconds = Math.min(fullDaySeconds, Math.max(0, resolveSeconds(rangeEnd)));
      const cutoffTime = effectiveSeconds >= fullDaySeconds ? '24:00:00' : secondsToTime(effectiveSeconds);
      const isCurrentRangeToday = isToday(rangeStart) || isToday(rangeEnd);
      const prevCompareHour = isCurrentRangeToday ? Math.max(0, targetHour - 1) : targetHour;
      const prevCutoffSeconds = isCurrentRangeToday ? Math.min(fullDaySeconds, (prevCompareHour + 1) * 3600) : effectiveSeconds;
      const prevCutoffTime = prevCutoffSeconds >= fullDaySeconds ? '24:00:00' : secondsToTime(prevCutoffSeconds);

      const sqlSessRange = `SELECT COALESCE(SUM(COALESCE(adjusted_number_of_sessions, number_of_sessions)),0) AS total FROM hourly_sessions_summary_shopify WHERE date >= ? AND date <= ? AND hour <= ?`;
      const orderRangeSql = `SELECT COUNT(DISTINCT order_name) AS cnt FROM shopify_orders WHERE created_dt >= ? AND created_dt <= ? AND created_time < ?`;
      const sqlOverallSessions = `SELECT COALESCE(SUM(total_sessions),0) AS total FROM overall_summary WHERE date >= ? AND date <= ?`;

      const prevWin = previousWindow(rangeStart, rangeEnd);

      const [sessCurRows, sessPrevRows, ordCurRows, ordPrevRows, overallCurrSess] = await Promise.all([
        conn.query(sqlSessRange, { type: QueryTypes.SELECT, replacements: [rangeStart, rangeEnd, targetHour] }),
        conn.query(sqlSessRange, { type: QueryTypes.SELECT, replacements: [prevWin.prevStart, prevWin.prevEnd, prevCompareHour] }),
        conn.query(orderRangeSql, { type: QueryTypes.SELECT, replacements: [rangeStart, rangeEnd, cutoffTime] }),
        conn.query(orderRangeSql, { type: QueryTypes.SELECT, replacements: [prevWin.prevStart, prevWin.prevEnd, prevCutoffTime] }),
        (isToday(rangeStart) || isToday(rangeEnd)) ? conn.query(sqlOverallSessions, { type: QueryTypes.SELECT, replacements: [rangeStart, rangeEnd] }) : Promise.resolve(null),
      ]);

      let curSessions = Number(sessCurRows?.[0]?.total || 0);
      if (overallCurrSess) {
        curSessions = Number(overallCurrSess?.[0]?.total || 0);
      }
      const prevSessions = Number(sessPrevRows?.[0]?.total || 0);
      const curOrders = Number(ordCurRows?.[0]?.cnt || 0);
      const prevOrders = Number(ordPrevRows?.[0]?.cnt || 0);

      const curCVR = curSessions > 0 ? (curOrders / curSessions) : 0;
      const prevCVR = prevSessions > 0 ? (prevOrders / prevSessions) : 0;
      const delta = computePercentDelta(curCVR * 100, prevCVR * 100);
      return {
        metric: 'CVR_DELTA',
        range: { start, end },
        current: { total_orders: curOrders, total_sessions: curSessions, cvr: curCVR, cvr_percent: curCVR * 100 },
        previous: { total_orders: prevOrders, total_sessions: prevSessions, cvr: prevCVR, cvr_percent: prevCVR * 100 },
        diff_pp: delta.diff_pp,
        diff_pct: delta.diff_pct,
        direction: delta.direction,
        align: 'hour',
        hour: targetHour,
        cutoff_time: cutoffTime
      };
    }

    const targetHour = resolveTargetHour ? resolveTargetHour(target) : (target === todayIst ? nowIst.getUTCHours() : 23);
    const effectiveSeconds = Math.min(fullDaySeconds, Math.max(0, resolveSeconds(target)));
    const cutoffTime = effectiveSeconds >= fullDaySeconds ? '24:00:00' : secondsToTime(effectiveSeconds);
    const isCurrentToday = isToday(target);
    const prevCompareHour = isCurrentToday ? Math.max(0, targetHour - 1) : targetHour;
    const prevCutoffSeconds = isCurrentToday ? Math.min(fullDaySeconds, (prevCompareHour + 1) * 3600) : effectiveSeconds;
    const prevCutoffTime = prevCutoffSeconds >= fullDaySeconds ? '24:00:00' : secondsToTime(prevCutoffSeconds);

    const sqlSess = `SELECT COALESCE(SUM(COALESCE(adjusted_number_of_sessions, number_of_sessions)),0) AS total FROM hourly_sessions_summary_shopify WHERE date = ? AND hour <= ?`;
    const orderSql = `SELECT COUNT(DISTINCT order_name) AS cnt FROM shopify_orders WHERE created_dt >= ? AND created_dt <= ? AND created_time < ?`;
    const sqlOverallSessions = `SELECT COALESCE(SUM(total_sessions),0) AS total FROM overall_summary WHERE date = ?`;

    const [sessCurRows, sessPrevRows, ordersCurRows, ordersPrevRows, overallCurrSess] = await Promise.all([
      conn.query(sqlSess, { type: QueryTypes.SELECT, replacements: [target, targetHour] }),
      conn.query(sqlSess, { type: QueryTypes.SELECT, replacements: [prevStr, prevCompareHour] }),
      conn.query(orderSql, { type: QueryTypes.SELECT, replacements: [target, target, cutoffTime] }),
      conn.query(orderSql, { type: QueryTypes.SELECT, replacements: [prevStr, prevStr, prevCutoffTime] }),
      isCurrentToday ? conn.query(sqlOverallSessions, { type: QueryTypes.SELECT, replacements: [target] }) : Promise.resolve(null),
    ]);

    let curSessions = Number(sessCurRows?.[0]?.total || 0);
    if (overallCurrSess) {
      curSessions = Number(overallCurrSess?.[0]?.total || 0);
    }
    const prevSessions = Number(sessPrevRows?.[0]?.total || 0);
    const curOrders = Number(ordersCurRows?.[0]?.cnt || 0);
    const prevOrders = Number(ordersPrevRows?.[0]?.cnt || 0);

    const curCVR = curSessions > 0 ? (curOrders / curSessions) : 0;
    const prevCVR = prevSessions > 0 ? (prevOrders / prevSessions) : 0;
    const delta = computePercentDelta(curCVR * 100, prevCVR * 100);
    return {
      metric: 'CVR_DELTA',
      date: target,
      current: { total_orders: curOrders, total_sessions: curSessions, cvr: curCVR, cvr_percent: curCVR * 100 },
      previous: { total_orders: prevOrders, total_sessions: prevSessions, cvr: prevCVR, cvr_percent: prevCVR * 100 },
      diff_pp: delta.diff_pp,
      diff_pct: delta.diff_pct,
      direction: delta.direction,
      align: 'hour',
      hour: targetHour,
      cutoff_time: cutoffTime
    };
  }

  const [current, previous] = await Promise.all([
    computeCVRForDay(target, conn),
    computeCVRForDay(prevStr, conn)
  ]);
  const delta = computePercentDelta(current.cvr_percent || 0, previous.cvr_percent || 0);
  return { metric: 'CVR_DELTA', date: target, current, previous, diff_pp: delta.diff_pp, diff_pct: delta.diff_pct, direction: delta.direction };
}

async function fetchCachedMetrics(brandKey, date) {
  const key = `metrics:${brandKey.toLowerCase()}:${date}`;
  const now = Date.now();

  // 1. Check in-memory cache
  if (MEM_CACHE.has(key)) {
    const entry = MEM_CACHE.get(key);
    if (now - entry.timestamp < CACHE_TTL_MS) {
      if (entry.promise) {
        console.log(`[MEM CACHE] Reuse pending request for ${brandKey} on ${date}`);
        return entry.promise;
      }
      console.log(`[MEM CACHE] Hit for ${brandKey} on ${date}`);
      return entry.data;
    }
    MEM_CACHE.delete(key);
  }

  // 2. Fetch from Direct Redis
  const promise = (async () => {
    try {
      let data = null;
      if (redisClient) {
         // Assuming key format is simple: "brand_date"
         // If pipeline uses "metrics:brand:date", change here.
         // Based on previous conversations, sticking to simple key or pipeline.py logic
         // Let's assume the key is exactly as generated above: `${brandKey.toLowerCase()}_${date}`
         const raw = await redisClient.get(key);
         if (raw) {
           data = JSON.parse(raw);
           console.log(`[REDIS HIT] ${key}`);
         } else {
           console.log(`[REDIS MISS] ${key}`);
         }
      } else {
         console.warn(`[REDIS SKIP] Client not available`);
      }

      if (data) {
        // Update cache with actual data
        MEM_CACHE.set(key, { timestamp: Date.now(), data: data, promise: null });
        return data;
      }
      
      return null;
    } catch (error) {
       console.error(`[REDIS ERROR] Fetch failed for ${key}`, error.message);
       MEM_CACHE.delete(key);
       return null;
    } finally {
      // If we had a promise in cache, clear it if it failed
      const entry = MEM_CACHE.get(key);
      if (entry && entry.promise) {
        MEM_CACHE.delete(key);
      }
    }
  })();

  MEM_CACHE.set(key, { timestamp: now, data: null, promise });
  return promise;
}

async function fetchCachedMetricsBatch(brandKey, dates) {
  const keys = dates.map(d => `metrics:${brandKey.toLowerCase()}:${d}`);
  const now = Date.now();
  const results = new Array(dates.length).fill(null);
  const missingIndices = [];
  const missingKeys = [];

  // 1. Check Memory Cache
  keys.forEach((key, idx) => {
    if (MEM_CACHE.has(key)) {
       const entry = MEM_CACHE.get(key);
       if (now - entry.timestamp < CACHE_TTL_MS && entry.data) {
           console.log(`[MEM CACHE] Hit for ${key}`);
           results[idx] = entry.data;
           return;
       }
       if (now - entry.timestamp >= CACHE_TTL_MS) MEM_CACHE.delete(key);
    }
    missingIndices.push(idx);
    missingKeys.push(key);
  });

  if (missingKeys.length === 0) return results;

  // 2. MGET from Redis
  try {
     if (redisClient) {
        console.log(`[REDIS MGET] Fetching ${missingKeys.length} keys`);
        const rawValues = await redisClient.mget(missingKeys);
        
        rawValues.forEach((raw, i) => {
           const originalIdx = missingIndices[i];
           const key = missingKeys[i];
           
           if (raw) {
              const data = JSON.parse(raw);
              MEM_CACHE.set(key, { timestamp: now, data, promise: null });
              results[originalIdx] = data;
              console.log(`[REDIS HIT] ${key}`);
           } else {
              console.log(`[REDIS MISS] ${key}`);
           }
        });
     } else {
        console.warn(`[REDIS SKIP] Client not available`);
     }
  } catch (e) {
     console.error('[REDIS BATCH ERROR]', e.message);
  }
  return results;
}


function isToday(dateStr) {
  if (!dateStr) return false;
  const now = new Date();
  const today = `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
  return dateStr === today;
}

function resolveShopSubdomain(brandKey) {
  if (!brandKey) return null;
  const upper = brandKey.toString().trim().toUpperCase();
  if (SHOP_DOMAIN_CACHE.has(upper)) {
    return SHOP_DOMAIN_CACHE.get(upper);
  }
  const candidates = [
    `SHOP_NAME_${upper}`,
    `${upper}_SHOP_NAME`,
    `SHOP_DOMAIN_${upper}`,
    `${upper}_SHOP_DOMAIN`,
  ];
  for (const envKey of candidates) {
    const value = process.env[envKey];
    if (value && value.trim()) {
      const trimmed = value.trim();
      SHOP_DOMAIN_CACHE.set(upper, trimmed);
      return trimmed;
    }
  }
  SHOP_DOMAIN_CACHE.set(upper, null);
  return null;
}

function buildMetricsController() {
  return {
    aov: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
        if (!parsed.success) return res.status(400).json({ error: "Invalid date range", details: parsed.error.flatten() });
        const { start, end } = parsed.data;
        
        // Cache check
        if (start && end && start === end) {
          const cached = await fetchCachedMetrics(req.brandKey, start);
          if (cached) {
            console.log(`[CACHE USE] AOV for ${req.brandKey} on ${start} | Value: ${cached.average_order_value}`);
            return res.json({ 
              metric: "AOV", 
              range: { start, end }, 
              total_sales: cached.total_sales, 
              total_orders: cached.total_orders, 
              aov: cached.average_order_value 
            });
          }
        }

        const result = await computeAOV({ start, end, conn: req.brandDb.sequelize });
        console.log(`[DB FETCH] AOV for ${req.brandKey} on range ${start} to ${end} | Result: ${JSON.stringify({ total_sales: result.total_sales, total_orders: result.total_orders, aov: result.aov })}`);
        return res.json({ metric: "AOV", range: { start: start || null, end: end || null }, total_sales: result.total_sales, total_orders: result.total_orders, aov: result.aov });
      } catch (err) { console.error(err); return res.status(500).json({ error: "Internal server error" }); }
    },

    cvr: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
        if (!parsed.success) return res.status(400).json({ error: "Invalid date range", details: parsed.error.flatten() });
        const { start, end } = parsed.data;

        // Cache check
        if (start && end && start === end) {
          const cached = await fetchCachedMetrics(req.brandKey, start);
          if (cached) {
            console.log(`[CACHE USE] CVR for ${req.brandKey} on ${start} | Value: ${cached.conversion_rate}`);
            return res.json({ 
              metric: "CVR", 
              range: { start, end }, 
              total_orders: cached.total_orders, 
              total_sessions: cached.total_sessions, 
              cvr: cached.conversion_rate / 100, 
              cvr_percent: cached.conversion_rate
            });
          }
        }

        const result = await computeCVR({ start, end, conn: req.brandDb.sequelize });
        console.log(`[DB FETCH] CVR for ${req.brandKey} on range ${start} to ${end} | Result: ${JSON.stringify({ total_orders: result.total_orders, total_sessions: result.total_sessions, cvr: result.cvr })}`);
        return res.json({ metric: "CVR", range: { start: start || null, end: end || null }, total_orders: result.total_orders, total_sessions: result.total_sessions, cvr: result.cvr, cvr_percent: result.cvr_percent });
      } catch (err) { console.error(err); return res.status(500).json({ error: "Internal server error" }); }
    },

    cvrDelta: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
        if (!parsed.success) return res.status(400).json({ error: "Invalid date range", details: parsed.error.flatten() });
        const { start, end } = parsed.data;
        const align = (req.query.align || '').toString().toLowerCase();
        const compare = (req.query.compare || '').toString().toLowerCase();

        if (compare === 'prev-range-avg' && start && end) {
          const curr = await cvrForRange({ start, end, conn: req.brandDb.sequelize });
          const prevWin = previousWindow(start, end);
          const prev = await cvrForRange({ start: prevWin.prevStart, end: prevWin.prevEnd, conn: req.brandDb.sequelize });
          const delta = computePercentDelta(curr.cvr_percent || 0, prev.cvr_percent || 0);
          return res.json({ metric: 'CVR_DELTA', range: { start, end }, current: curr, previous: prev, diff_pp: delta.diff_pp, diff_pct: delta.diff_pct, direction: delta.direction, compare: 'prev-range-avg' });
        }

        const base = new Date(`${target}T00:00:00Z`);
        const prev = new Date(base.getTime() - 24 * 3600_000);
        const prevStr = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth()+1).padStart(2,'0')}-${String(prev.getUTCDate()).padStart(2,'0')}`;

        const conn = req.brandDb.sequelize;
        if (align === 'hour') {
          return res.json(await computeMetricDelta({
            metricName: 'CVR_DELTA',
            range: { start: start || target, end: end || target },
            conn,
            queryFn: async ({ rangeStart, rangeEnd, prevStart, prevEnd, cutoffTime, prevCutoffTime, targetHour, prevCompareHour, isCurrentRangeToday }) => {
              const sqlSessRange = `SELECT COALESCE(SUM(COALESCE(adjusted_number_of_sessions, number_of_sessions)),0) AS total FROM hourly_sessions_summary_shopify WHERE date >= ? AND date <= ? AND hour <= ?`;
              const orderRangeSql = `SELECT COUNT(DISTINCT order_name) AS cnt FROM shopify_orders WHERE created_dt >= ? AND created_dt <= ? AND created_time < ?`;
              const sqlOverallSessions = `SELECT COALESCE(SUM(total_sessions),0) AS total FROM overall_summary WHERE date >= ? AND date <= ?`;

              const [sessCurRows, sessPrevRows, ordCurRows, ordPrevRows, overallCurrSess] = await Promise.all([
                conn.query(sqlSessRange, { type: QueryTypes.SELECT, replacements: [rangeStart, rangeEnd, targetHour] }),
                conn.query(sqlSessRange, { type: QueryTypes.SELECT, replacements: [prevStart, prevEnd, prevCompareHour] }),
                conn.query(orderRangeSql, { type: QueryTypes.SELECT, replacements: [rangeStart, rangeEnd, cutoffTime] }),
                conn.query(orderRangeSql, { type: QueryTypes.SELECT, replacements: [prevStart, prevEnd, prevCutoffTime] }),
                isCurrentRangeToday ? conn.query(sqlOverallSessions, { type: QueryTypes.SELECT, replacements: [rangeStart, rangeEnd] }) : Promise.resolve(null),
              ]);

              let curSessions = Number(sessCurRows?.[0]?.total || 0);
              if (overallCurrSess) {
                curSessions = Number(overallCurrSess?.[0]?.total || 0);
              }
              const prevSessions = Number(sessPrevRows?.[0]?.total || 0);
              const curOrders = Number(ordCurRows?.[0]?.cnt || 0);
              const prevOrders = Number(ordPrevRows?.[0]?.cnt || 0);
              const curCVR = curSessions > 0 ? (curOrders / curSessions) : 0;
              const prevCVR = prevSessions > 0 ? (prevOrders / prevSessions) : 0;
              
              return { 
                currentVal: curCVR * 100, 
                previousVal: prevCVR * 100,
                currentMeta: { total_orders: curOrders, total_sessions: curSessions, cvr: curCVR, cvr_percent: curCVR * 100 },
                previousMeta: { total_orders: prevOrders, total_sessions: prevSessions, cvr: prevCVR, cvr_percent: prevCVR * 100 }
              };
            }
          }));
        }

        const prevWin = previousWindow(target, target); // Handles single date same as range
        const [current, previous] = await Promise.all([
          computeCVRForDay(target, conn),
          computeCVRForDay(prevWin.prevStart, conn)
        ]);
        const delta = computePercentDelta(current.cvr_percent || 0, previous.cvr_percent || 0);
        return res.json({ metric: 'CVR_DELTA', date: target, current, previous, diff_pp: delta.diff_pp, diff_pct: delta.diff_pct, direction: delta.direction });
      } catch (err) { console.error(err); return res.status(500).json({ error: "Internal server error" }); }
    },

    totalOrdersDelta: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
        if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
        const { start, end } = parsed.data;
        const align = (req.query.align || '').toString().toLowerCase();
        if (align === 'hour') {
          return res.json(await computeMetricDelta({
            metricName: 'TOTAL_ORDERS_DELTA',
            range: { start: start || date, end: end || date },
            conn: req.brandDb.sequelize,
            queryFn: async ({ rangeStart, rangeEnd, prevStart, prevEnd, cutoffTime, prevCutoffTime }) => {
              const sqlRange = `SELECT COUNT(DISTINCT order_name) AS cnt FROM shopify_orders WHERE created_dt >= ? AND created_dt <= ? AND created_time < ?`;
              const [currRows, prevRows] = await Promise.all([
                req.brandDb.sequelize.query(sqlRange, { type: QueryTypes.SELECT, replacements: [rangeStart, rangeEnd, cutoffTime] }),
                req.brandDb.sequelize.query(sqlRange, { type: QueryTypes.SELECT, replacements: [prevStart, prevEnd, prevCutoffTime] }),
              ]);
              return { currentVal: Number(currRows?.[0]?.cnt || 0), previousVal: Number(prevRows?.[0]?.cnt || 0) };
            }
          }));
        }

        if (!date) return res.json({ metric: 'TOTAL_ORDERS_DELTA', date: null, current: null, previous: null, diff_pct: 0, direction: 'flat' });
        const delta = await deltaForSum('total_orders', date, req.brandDb.sequelize);
        return res.json({ metric: 'TOTAL_ORDERS_DELTA', date, ...delta });
      } catch (e) { console.error(e); return res.status(500).json({ error: 'Internal server error' }); }
    },

    totalSalesDelta: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
        if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
        const { start, end } = parsed.data;
        const align = (req.query.align || '').toString().toLowerCase();
        if (align === 'hour') {
          return res.json(await computeMetricDelta({
            metricName: 'TOTAL_SALES_DELTA',
            range: { start: start || date, end: end || date },
            conn: req.brandDb.sequelize,
            queryFn: async ({ rangeStart, rangeEnd, prevStart, prevEnd, cutoffTime, prevCutoffTime }) => {
              const sqlRange = `SELECT COALESCE(SUM(total_price),0) AS total FROM shopify_orders WHERE created_dt >= ? AND created_dt <= ? AND created_time < ?`;
              const [currRows, prevRows] = await Promise.all([
                req.brandDb.sequelize.query(sqlRange, { type: QueryTypes.SELECT, replacements: [rangeStart, rangeEnd, cutoffTime] }),
                req.brandDb.sequelize.query(sqlRange, { type: QueryTypes.SELECT, replacements: [prevStart, prevEnd, prevCutoffTime] }),
              ]);
              return { currentVal: Number(currRows?.[0]?.total || 0), previousVal: Number(prevRows?.[0]?.total || 0) };
            }
          }));
        }

        const delta = await deltaForSum('total_sales', date, req.brandDb.sequelize);
        return res.json({ metric: 'TOTAL_SALES_DELTA', date, ...delta });
      } catch (e) { console.error(e); return res.status(500).json({ error: 'Internal server error' }); }
    },

    rolling30d: async (req, res) => {
      try {
        const brandQuery = (req.query.brand || req.query.brand_key || '').toString().trim() || null;
        let conn = req.brandDb && req.brandDb.sequelize ? req.brandDb.sequelize : null;
        if (brandQuery) {
          const brandCheck = requireBrandKey(brandQuery);
          if (brandCheck.error) return res.status(400).json({ error: brandCheck.error });
          const brandConn = await getBrandConnection(brandCheck.cfg);
          conn = brandConn.sequelize;
        }
        if (!conn) return res.status(500).json({ error: 'Brand DB connection unavailable' });

        let end = (req.query.end || '').toString().trim() || null;
        if (end) {
          const parsed = isoDate.safeParse(end);
          if (!parsed.success) return res.status(400).json({ error: 'Invalid end date. Use YYYY-MM-DD' });
        } else {
          const rows = await conn.query('SELECT MAX(date) AS max_d FROM overall_summary', { type: QueryTypes.SELECT });
          const maxd = Array.isArray(rows) ? rows[0]?.max_d : (rows && rows.max_d);
          end = maxd || new Date().toISOString().slice(0,10);
        }

        const days = [];
        for (let i = 29; i >= 0; --i) {
          days.push(shiftDays(end, -i));
        }

        const series = [];
        for (const day of days) {
          const winStart = shiftDays(day, -29);
          const winEnd = day;
          const aovVal = await aovForRange({ start: winStart, end: winEnd, conn });
          const aovTotals = await computeAOV({ start: winStart, end: winEnd, conn });
          const cvrObj = await cvrForRange({ start: winStart, end: winEnd, conn });
          const cvrTotals = await computeCVR({ start: winStart, end: winEnd, conn });

          series.push({
            date: day,
            window_start: winStart,
            window_end: winEnd,
            aov_30d: Number(aovVal || 0),
            aov_totals: { total_sales: Number(aovTotals.total_sales || 0), total_orders: Number(aovTotals.total_orders || 0) },
            cvr_30d: Number(cvrObj.cvr || 0),
            cvr_percent_30d: Number(cvrObj.cvr_percent || 0),
            cvr_totals: { total_orders: Number(cvrTotals.total_orders || 0), total_sessions: Number(cvrTotals.total_sessions || 0) }
          });
        }

        return res.json({ metric: 'ROLLING_30D_SERIES', brand: brandQuery || null, end, days: series });
      } catch (e) { console.error(e); return res.status(500).json({ error: 'Internal server error' }); }
    },

    totalSessionsDelta: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
        if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
        const { start, end } = parsed.data;
        const align = (req.query.align || '').toString().toLowerCase();
        if (align === 'hour') {
          return res.json(await computeMetricDelta({
            metricName: 'TOTAL_SESSIONS_DELTA',
            range: { start: start || date, end: end || date },
            conn: req.brandDb.sequelize,
            queryFn: async ({ rangeStart, rangeEnd, prevStart, prevEnd, targetHour, prevCompareHour, isCurrentRangeToday }) => {
              const sqlRange = `SELECT COALESCE(SUM(COALESCE(adjusted_number_of_sessions, number_of_sessions)),0) AS total FROM hourly_sessions_summary_shopify WHERE date >= ? AND date <= ? AND hour <= ?`;
              const sqlOverallSessions = `SELECT COALESCE(SUM(total_sessions),0) AS total FROM overall_summary WHERE date >= ? AND date <= ?`;
              const [currRow, prevRow, overallCurrRow] = await Promise.all([
                req.brandDb.sequelize.query(sqlRange, { type: QueryTypes.SELECT, replacements: [rangeStart, rangeEnd, targetHour] }),
                req.brandDb.sequelize.query(sqlRange, { type: QueryTypes.SELECT, replacements: [prevStart, prevEnd, prevCompareHour] }),
                isCurrentRangeToday ? req.brandDb.sequelize.query(sqlOverallSessions, { type: QueryTypes.SELECT, replacements: [rangeStart, rangeEnd] }) : Promise.resolve(null),
              ]);
              let curr = Number(currRow?.[0]?.total || 0);
              if (overallCurrRow) {
                curr = Number(overallCurrRow?.[0]?.total || 0);
              }
              const prevVal = Number(prevRow?.[0]?.total || 0);
              return { currentVal: curr, previousVal: prevVal };
            }
          }));
        }

        const d = await deltaForSum('total_sessions', date, req.brandDb.sequelize);
        return res.json({ metric: 'TOTAL_SESSIONS_DELTA', date, ...d });
      } catch (e) { console.error(e); return res.status(500).json({ error: 'Internal server error' }); }
    },

    atcSessionsDelta: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
        if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
        const { start, end } = parsed.data;
        const align = (req.query.align || '').toString().toLowerCase();
        if (align === 'hour') {
          return res.json(await computeMetricDelta({
            metricName: 'ATC_SESSIONS_DELTA',
            range: { start: start || date, end: end || date },
            conn: req.brandDb.sequelize,
            queryFn: async ({ rangeStart, rangeEnd, prevStart, prevEnd, targetHour, prevCompareHour, isCurrentRangeToday }) => {
              const sqlRange = `SELECT COALESCE(SUM(number_of_atc_sessions),0) AS total FROM hourly_sessions_summary_shopify WHERE date >= ? AND date <= ? AND hour <= ?`;
              const sqlOverallAtc = `SELECT COALESCE(SUM(total_atc_sessions),0) AS total FROM overall_summary WHERE date >= ? AND date <= ?`;
              const [currRow, prevRow, overallCurrRow] = await Promise.all([
                req.brandDb.sequelize.query(sqlRange, { type: QueryTypes.SELECT, replacements: [rangeStart, rangeEnd, targetHour] }),
                req.brandDb.sequelize.query(sqlRange, { type: QueryTypes.SELECT, replacements: [prevStart, prevEnd, prevCompareHour] }),
                isCurrentRangeToday ? req.brandDb.sequelize.query(sqlOverallAtc, { type: QueryTypes.SELECT, replacements: [rangeStart, rangeEnd] }) : Promise.resolve(null),
              ]);
              let curr = Number(currRow?.[0]?.total || 0);
              if (overallCurrRow) {
                curr = Number(overallCurrRow?.[0]?.total || 0);
              }
              const prevVal = Number(prevRow?.[0]?.total || 0);
              return { currentVal: curr, previousVal: prevVal };
            }
          }));
        }

        const d = await deltaForSum('total_atc_sessions', date, req.brandDb.sequelize);
        return res.json({ metric: 'ATC_SESSIONS_DELTA', date, ...d });
      } catch (e) { console.error(e); return res.status(500).json({ error: 'Internal server error' }); }
    },

    aovDelta: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
        if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
        const { start, end } = parsed.data;
        const align = (req.query.align || '').toString().toLowerCase();
        if (align === 'hour') {
          return res.json(await computeMetricDelta({
            metricName: 'AOV_DELTA',
            range: { start: start || date, end: end || date },
            conn: req.brandDb.sequelize,
            queryFn: async ({ rangeStart, rangeEnd, prevStart, prevEnd, cutoffTime, prevCutoffTime }) => {
              const salesSqlRange = `SELECT COALESCE(SUM(total_price),0) AS total FROM shopify_orders WHERE created_dt >= ? AND created_dt <= ? AND created_time < ?`;
              const ordersSqlRange = `SELECT COUNT(DISTINCT order_name) AS cnt FROM shopify_orders WHERE created_dt >= ? AND created_dt <= ? AND created_time < ?`;

              const [salesCurRows, salesPrevRows, ordersCurRows, ordersPrevRows] = await Promise.all([
                req.brandDb.sequelize.query(salesSqlRange, { type: QueryTypes.SELECT, replacements: [rangeStart, rangeEnd, cutoffTime] }),
                req.brandDb.sequelize.query(salesSqlRange, { type: QueryTypes.SELECT, replacements: [prevStart, prevEnd, prevCutoffTime] }),
                req.brandDb.sequelize.query(ordersSqlRange, { type: QueryTypes.SELECT, replacements: [rangeStart, rangeEnd, cutoffTime] }),
                req.brandDb.sequelize.query(ordersSqlRange, { type: QueryTypes.SELECT, replacements: [prevStart, prevEnd, prevCutoffTime] }),
              ]);

              const curSales = Number(salesCurRows?.[0]?.total || 0);
              const prevSales = Number(salesPrevRows?.[0]?.total || 0);
              const curOrders = Number(ordersCurRows?.[0]?.cnt || 0);
              const prevOrders = Number(ordersPrevRows?.[0]?.cnt || 0);

              const curAov = curOrders > 0 ? curSales / curOrders : 0;
              const prevAov = prevOrders > 0 ? prevSales / prevOrders : 0;
              return { currentVal: curAov, previousVal: prevAov };
            }
          }));
        }

        const d = await deltaForAOV(date, req.brandDb.sequelize);
        return res.json({ metric: 'AOV_DELTA', date, ...d });
      } catch (e) { console.error(e); return res.status(500).json({ error: 'Internal server error' }); }
    },

    totalSales: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
        if (!parsed.success) return res.status(400).json({ error: "Invalid date range", details: parsed.error.flatten() });
        const { start, end } = parsed.data;

        // Cache check
        if (start && end && start === end) {
          const cached = await fetchCachedMetrics(req.brandKey, start);
          if (cached) {
            return res.json({ metric: "TOTAL_SALES", range: { start, end }, total_sales: cached.total_sales });
          }
        }

        const total_sales = await computeTotalSales({ start, end, conn: req.brandDb.sequelize });
        if (start && end && start === end) {
             const cached = await fetchCachedMetrics(req.brandKey, start);
             if (cached) {
                console.log(`[CACHE USE] TOTAL_SALES for ${req.brandKey} on ${start} | Value: ${cached.total_sales}`);
                return res.json({ metric: "TOTAL_SALES", range: { start: start || null, end: end || null }, total_sales: cached.total_sales });
             }
        }
        console.log(`[DB FETCH] TOTAL_SALES for ${req.brandKey} on range ${start} to ${end} | Result: ${total_sales}`);
        return res.json({ metric: "TOTAL_SALES", range: { start: start || null, end: end || null }, total_sales });
      } catch (err) { console.error(err); return res.status(500).json({ error: "Internal server error" }); }
    },

    totalOrders: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
        if (!parsed.success) return res.status(400).json({ error: "Invalid date range", details: parsed.error.flatten() });
        const { start, end } = parsed.data;

        // Cache check
        if (start && end && start === end) {
          const cached = await fetchCachedMetrics(req.brandKey, start);
          if (cached) {
            return res.json({ metric: "TOTAL_ORDERS", range: { start, end }, total_orders: cached.total_orders });
          }
        }

        const total_orders = await computeTotalOrders({ start, end, conn: req.brandDb.sequelize });
        if (start && end && start === end) {
            const cached = await fetchCachedMetrics(req.brandKey, start);
            if (cached) {
              console.log(`[CACHE USE] TOTAL_ORDERS for ${req.brandKey} on ${start} | Value: ${cached.total_orders}`);
              return res.json({ metric: "TOTAL_ORDERS", range: { start: start || null, end: end || null }, total_orders: cached.total_orders });
            }
        }
        console.log(`[DB FETCH] TOTAL_ORDERS for ${req.brandKey} on range ${start} to ${end} | Result: ${total_orders}`);
        return res.json({ metric: "TOTAL_ORDERS", range: { start: start || null, end: end || null }, total_orders });
      } catch (err) { console.error(err); return res.status(500).json({ error: "Internal server error" }); }
    },

    funnelStats: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
        if (!parsed.success) return res.status(400).json({ error: "Invalid date range", details: parsed.error.flatten() });
        const { start, end } = parsed.data;
        const productIdRaw = (req.query.product_id || '').toString().trim();
        if (!productIdRaw) {
          const stats = await computeFunnelStats({ start, end, conn: req.brandDb.sequelize });
          return res.json({ metric: "FUNNEL_STATS", range: { start: start || null, end: end || null }, total_sessions: stats.total_sessions, total_atc_sessions: stats.total_atc_sessions, total_orders: stats.total_orders });
        }

        const effectiveStart = start || end;
        const effectiveEnd = end || start;
        const startDate = effectiveStart;
        const endDate = effectiveEnd;
        const sql = `
          WITH sess AS (
            SELECT
              SUM(sessions) AS total_sessions,
              SUM(sessions_with_cart_additions) AS total_atc_sessions
            FROM mv_product_sessions_by_path_daily
            WHERE date >= ? AND date <= ?
              AND product_id = ?
          ),
          ord AS (
            SELECT
              COUNT(DISTINCT order_name) AS total_orders
            FROM shopify_orders
            WHERE created_date >= ? AND created_date <= ?
              AND product_id = ?
          )
          SELECT
            COALESCE(sess.total_sessions, 0) AS total_sessions,
            COALESCE(sess.total_atc_sessions, 0) AS total_atc_sessions,
            COALESCE(ord.total_orders, 0) AS total_orders
          FROM sess CROSS JOIN ord
        `;

        const rows = await req.brandDb.sequelize.query(sql, {
          type: QueryTypes.SELECT,
          replacements: [startDate, endDate, productIdRaw, startDate, endDate, productIdRaw]
        });
        const r = rows?.[0] || { total_sessions: 0, total_atc_sessions: 0, total_orders: 0 };
        return res.json({
          metric: "FUNNEL_STATS",
          range: { start: effectiveStart || null, end: effectiveEnd || null, product_id: productIdRaw },
          total_sessions: Number(r.total_sessions || 0),
          total_atc_sessions: Number(r.total_atc_sessions || 0),
          total_orders: Number(r.total_orders || 0)
        });
      } catch (err) { console.error(err); return res.status(500).json({ error: "Internal server error" }); }
    },

    orderSplit: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
        if (!parsed.success) return res.status(400).json({ error: "Invalid date range", details: parsed.error.flatten() });
        const { start, end } = parsed.data;
        const productIdRaw = (req.query.product_id || '').toString().trim();

        if (productIdRaw) {
          if (!start && !end) {
            return res.json({ metric: "ORDER_SPLIT", range: { start: null, end: null, product_id: productIdRaw }, cod_orders: 0, prepaid_orders: 0, partially_paid_orders: 0, total_orders_from_split: 0, cod_percent: 0, prepaid_percent: 0, partially_paid_percent: 0 });
          }
          const effectiveStart = start || end;
          const effectiveEnd = end || start;
          const startTs = `${effectiveStart} 00:00:00`;
          const endTsExclusive = new Date(`${effectiveEnd}T00:00:00Z`);
          endTsExclusive.setUTCDate(endTsExclusive.getUTCDate() + 1);
          const endTs = endTsExclusive.toISOString().slice(0,19).replace('T',' ');

          const sql = `
            SELECT payment_type, COUNT(DISTINCT order_name) AS cnt
            FROM (
              SELECT 
                CASE 
                  WHEN payment_gateway_names LIKE '%Gokwik PPCOD%' THEN 'Partial'
                  WHEN payment_gateway_names LIKE '%Cash on Delivery (COD)%' OR payment_gateway_names LIKE '%cash_on_delivery%' OR payment_gateway_names LIKE '%cash_on_delivery%' OR payment_gateway_names IS NULL OR payment_gateway_names = '' THEN 'COD'
                  ELSE 'Prepaid'
                END AS payment_type,
                order_name
              FROM shopify_orders
              WHERE created_at >= ? AND created_at < ? AND product_id = ?
              GROUP BY payment_gateway_names, order_name
            ) sub
            GROUP BY payment_type`;

          const rows = await req.brandDb.sequelize.query(sql, { type: QueryTypes.SELECT, replacements: [startTs, endTs, productIdRaw] });

          let cod_orders = 0; let prepaid_orders = 0; let partially_paid_orders = 0;
          for (const r of rows) {
            if (r.payment_type === 'COD') cod_orders = Number(r.cnt || 0);
            else if (r.payment_type === 'Prepaid') prepaid_orders = Number(r.cnt || 0);
            else if (r.payment_type === 'Partial') partially_paid_orders = Number(r.cnt || 0);
          }
          const total = cod_orders + prepaid_orders + partially_paid_orders;
          const cod_percent = total > 0 ? (cod_orders / total) * 100 : 0;
          const prepaid_percent = total > 0 ? (prepaid_orders / total) * 100 : 0;
          const partially_paid_percent = total > 0 ? (partially_paid_orders / total) * 100 : 0;
          return res.json({ metric: "ORDER_SPLIT", range: { start: effectiveStart, end: effectiveEnd, product_id: productIdRaw }, cod_orders, prepaid_orders, partially_paid_orders, total_orders_from_split: total, cod_percent, prepaid_percent, partially_paid_percent, sql_used: process.env.NODE_ENV === 'production' ? undefined : sql });
        }

        const [cod_orders, prepaid_orders, partially_paid_orders] = await Promise.all([
          rawSum("cod_orders", { start, end, conn: req.brandDb.sequelize }),
          rawSum("prepaid_orders", { start, end, conn: req.brandDb.sequelize }),
          rawSum("partially_paid_orders", { start, end, conn: req.brandDb.sequelize }),
        ]);
        const total = cod_orders + prepaid_orders + partially_paid_orders;
        const cod_percent = total > 0 ? (cod_orders / total) * 100 : 0;
        const prepaid_percent = total > 0 ? (prepaid_orders / total) * 100 : 0;
        const partially_paid_percent = total > 0 ? (partially_paid_orders / total) * 100 : 0;
        return res.json({ metric: "ORDER_SPLIT", range: { start: start || null, end: end || null }, cod_orders, prepaid_orders, partially_paid_orders, total_orders_from_split: total, cod_percent, prepaid_percent, partially_paid_percent });
      } catch (err) { console.error(err); return res.status(500).json({ error: "Internal server error" }); }
    },

    paymentSalesSplit: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
        if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
        const { start, end } = parsed.data;
        const productIdRaw = (req.query.product_id || '').toString().trim();
        const productFilter = productIdRaw ? 'AND product_id = ?' : '';

        if (!start && !end) {
          return res.json({ metric: 'PAYMENT_SPLIT_SALES', range: { start: null, end: null }, cod_sales: 0, prepaid_sales: 0, partial_sales: 0, total_sales_from_split: 0, cod_percent: 0, prepaid_percent: 0, partial_percent: 0 });
        }
        const effectiveStart = start || end;
        const effectiveEnd = end || start;
        const startTs = `${effectiveStart} 00:00:00`;
        const endTsExclusive = new Date(`${effectiveEnd}T00:00:00Z`);
        endTsExclusive.setUTCDate(endTsExclusive.getUTCDate() + 1);
        const endTs = endTsExclusive.toISOString().slice(0,19).replace('T',' ');

        const sql = `
      SELECT payment_type, SUM(max_price) AS sales
      FROM (
        SELECT 
          CASE 
            WHEN payment_gateway_names LIKE '%Gokwik PPCOD%' THEN 'Partial'
            WHEN payment_gateway_names LIKE '%Cash on Delivery (COD)%' OR payment_gateway_names LIKE '%cash_on_delivery%' OR payment_gateway_names LIKE '%cash_on_delivery%' OR payment_gateway_names IS NULL OR payment_gateway_names = '' THEN 'COD'
            ELSE 'Prepaid'
          END AS payment_type,
          order_name,
          MAX(total_price) AS max_price
        FROM shopify_orders
        WHERE created_at >= ? AND created_at < ?
        ${productFilter}
        GROUP BY payment_gateway_names, order_name
      ) sub
      GROUP BY payment_type`;

        let rows = [];
        try {
          const replacements = productIdRaw ? [startTs, endTs, productIdRaw] : [startTs, endTs];
          rows = await req.brandDb.sequelize.query(sql, { type: QueryTypes.SELECT, replacements });
        } catch (e) {
          console.error('[payment-sales-split] query failed', e.message);
          return res.json({ metric: 'PAYMENT_SPLIT_SALES', range: { start: effectiveStart, end: effectiveEnd }, cod_sales: 0, prepaid_sales: 0, partial_sales: 0, total_sales_from_split: 0, cod_percent: 0, prepaid_percent: 0, partial_percent: 0, warning: 'Query failed' });
        }

        let cod_sales = 0; let prepaid_sales = 0; let partial_sales = 0;
        for (const r of rows) {
          if (r.payment_type === 'COD') cod_sales = Number(r.sales || 0);
          else if (r.payment_type === 'Prepaid') prepaid_sales = Number(r.sales || 0);
          else if (r.payment_type === 'Partial') partial_sales = Number(r.sales || 0);
        }
        const total = cod_sales + prepaid_sales + partial_sales;
        const cod_percent = total > 0 ? (cod_sales / total) * 100 : 0;
        const prepaid_percent = total > 0 ? (prepaid_sales / total) * 100 : 0;
        const partial_percent = total > 0 ? (partial_sales / total) * 100 : 0;

        return res.json({ metric: 'PAYMENT_SPLIT_SALES', range: { start: effectiveStart, end: effectiveEnd }, cod_sales, prepaid_sales, partial_sales, total_sales_from_split: total, cod_percent, prepaid_percent, partial_percent, sql_used: process.env.NODE_ENV === 'production' ? undefined : sql });
      } catch (e) { console.error(e); return res.status(500).json({ error: 'Internal server error' }); }
    },

    topProductPages: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
        if (!parsed.success) {
          return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
        }
        const { start, end } = parsed.data;
        const rangeStart = start || end;
        const rangeEnd = end || start;
        if (!rangeStart || !rangeEnd) {
          return res.status(400).json({ error: 'start or end date required' });
        }
        if (rangeStart > rangeEnd) {
          return res.status(400).json({ error: 'start must be on or before end' });
        }

        const limitParam = Number(req.query.limit);
        const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 20) : 5;

        const sql = `
          SELECT landing_page_path,
                 MAX(product_id) AS product_id,
                 SUM(sessions) AS total_sessions,
                 SUM(sessions_with_cart_additions) AS total_atc_sessions
          FROM mv_product_sessions_by_path_daily
          WHERE landing_page_path IS NOT NULL
            AND landing_page_path <> ''
            AND date >= ? AND date <= ?
          GROUP BY landing_page_path
          ORDER BY total_sessions DESC
          LIMIT ${limit};
        `;

        const rows = await req.brandDb.sequelize.query(sql, {
          type: QueryTypes.SELECT,
          replacements: [rangeStart, rangeEnd],
        });

        const shopSubdomain = resolveShopSubdomain(req.brandKey);
        const host = shopSubdomain ? `${shopSubdomain}.myshopify.com` : null;

        const pages = rows.map((row, index) => {
          const totalSessions = Number(row.total_sessions || 0);
          const atcSessions = Number(row.total_atc_sessions || 0);
          const atcRate = totalSessions > 0 ? atcSessions / totalSessions : 0;
          const rawPath = typeof row.landing_page_path === 'string' ? row.landing_page_path.trim() : '';
          const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
          const fullPath = host ? `${host}${normalizedPath}` : normalizedPath;
          return {
            rank: index + 1,
            path: fullPath,
            product_id: row.product_id || null,
            sessions: totalSessions,
            sessions_with_cart_additions: atcSessions,
            add_to_cart_rate: atcRate,
            add_to_cart_rate_pct: atcRate * 100,
          };
        });

        return res.json({
          brand_key: req.brandKey || null,
          range: { start: rangeStart, end: rangeEnd },
          pages,
        });
      } catch (e) {
        console.error('[top-pdps] failed', e);
        return res.status(500).json({ error: 'Failed to load top PDP pages' });
      }
    },

    topProducts: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
        if (!parsed.success) {
          return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
        }
        const { start, end } = parsed.data;
        const rangeStart = start || end;
        const rangeEnd = end || start;
        if (!rangeStart || !rangeEnd) {
          return res.status(400).json({ error: 'start or end date required' });
        }
        if (rangeStart > rangeEnd) {
          return res.status(400).json({ error: 'start must be on or before end' });
        }

        const limitParam = Number(req.query.limit);
        const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 50) : 50;

        const sql = `
          SELECT product_id,
                 MIN(landing_page_path) AS landing_page_path,
                 SUM(sessions) AS total_sessions,
                 SUM(sessions_with_cart_additions) AS total_atc_sessions
          FROM mv_product_sessions_by_path_daily
          WHERE product_id IS NOT NULL
            AND product_id <> ''
            AND date >= ? AND date <= ?
          GROUP BY product_id
          ORDER BY total_sessions DESC
          LIMIT ${limit}
        `;

        const rows = await req.brandDb.sequelize.query(sql, {
          type: QueryTypes.SELECT,
          replacements: [rangeStart, rangeEnd],
        });

        const products = rows.map((row, index) => {
          const totalSessions = Number(row.total_sessions || 0);
          const atcSessions = Number(row.total_atc_sessions || 0);
          const atcRate = totalSessions > 0 ? atcSessions / totalSessions : 0;
          return {
            rank: index + 1,
            product_id: row.product_id,
            landing_page_path: row.landing_page_path || null,
            sessions: totalSessions,
            sessions_with_cart_additions: atcSessions,
            add_to_cart_rate: atcRate,
            add_to_cart_rate_pct: atcRate * 100,
          };
        });

        return res.json({
          brand_key: req.brandKey || null,
          range: { start: rangeStart, end: rangeEnd },
          products,
        });
      } catch (e) {
        console.error('[top-products] failed', e);
        return res.status(500).json({ error: 'Failed to load top products' });
      }
    },

    productKpis: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
        if (!parsed.success) {
          return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
        }
        const { start, end } = parsed.data;
        const rangeStart = start || end;
        const rangeEnd = end || start;
        if (!rangeStart || !rangeEnd) {
          return res.status(400).json({ error: 'start or end date required' });
        }
        if (rangeStart > rangeEnd) {
          return res.status(400).json({ error: 'start must be on or before end' });
        }

        const productIdRaw = (req.query.product_id || '').toString().trim();
        if (!productIdRaw) {
          return res.status(400).json({ error: 'product_id is required' });
        }

        const conn = req.brandDb.sequelize;

        const sessionsSql = `
          SELECT
            SUM(sessions) AS total_sessions,
            SUM(sessions_with_cart_additions) AS total_atc_sessions
          FROM mv_product_sessions_by_path_daily
          WHERE product_id = ?
            AND product_id IS NOT NULL
            AND date >= ? AND date <= ?
        `;

        const ordersSql = `
          SELECT
            COUNT(DISTINCT order_name) AS total_orders,
            COALESCE(SUM((line_item_price - COALESCE(discount_amount_per_line_item, 0)) * line_item_quantity), 0) AS total_sales
          FROM shopify_orders
          WHERE product_id = ?
            AND created_date >= ? AND created_date <= ?
        `;

        const [[sessRow], [orderRow]] = await Promise.all([
          conn.query(sessionsSql, { type: QueryTypes.SELECT, replacements: [productIdRaw, rangeStart, rangeEnd] }),
          conn.query(ordersSql, { type: QueryTypes.SELECT, replacements: [productIdRaw, rangeStart, rangeEnd] }),
        ]);

        const totalSessions = Number(sessRow?.total_sessions || 0);
        const totalAtcSessions = Number(sessRow?.total_atc_sessions || 0);
        const totalOrders = Number(orderRow?.total_orders || 0);
        const totalSales = Number(orderRow?.total_sales || 0);

        const addToCartRate = totalSessions > 0 ? totalAtcSessions / totalSessions : 0;
        const cvr = totalSessions > 0 ? totalOrders / totalSessions : 0;

        return res.json({
          product_id: productIdRaw,
          brand_key: req.brandKey || null,
          range: { start: rangeStart, end: rangeEnd },
          sessions: totalSessions,
          sessions_with_cart_additions: totalAtcSessions,
          add_to_cart_rate: addToCartRate,
          add_to_cart_rate_pct: addToCartRate * 100,
          total_orders: totalOrders,
          total_sales: totalSales,
          conversion_rate: cvr,
          conversion_rate_pct: cvr * 100,
        });
      } catch (e) {
        console.error('[product-kpis] failed', e);
        return res.status(500).json({ error: 'Failed to load product KPIs' });
      }
    },

    hourlyTrend: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
        if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
        const { start, end } = parsed.data;
        if (!start || !end) return res.status(400).json({ error: 'Both start and end dates are required' });
        if (start > end) return res.status(400).json({ error: 'Start date must be on or before end date' });

        const aggregate = (req.query.aggregate || '').toString().toLowerCase();
        const IST_OFFSET_MIN = 330;
        const offsetMs = IST_OFFSET_MIN * 60 * 1000;
        const nowIst = new Date(Date.now() + offsetMs);
        const todayIst = `${nowIst.getUTCFullYear()}-${String(nowIst.getUTCMonth() + 1).padStart(2, '0')}-${String(nowIst.getUTCDate()).padStart(2, '0')}`;
        const currentHourIst = nowIst.getUTCHours();
        const alignHourRaw = end === todayIst ? currentHourIst : 23;
        const alignHour = Math.max(0, Math.min(23, alignHourRaw));

        const rows = await req.brandDb.sequelize.query(
          `SELECT date, hour, total_sales, number_of_orders,
        COALESCE(adjusted_number_of_sessions, number_of_sessions) AS number_of_sessions,
        adjusted_number_of_sessions,
        number_of_sessions AS raw_number_of_sessions,
        number_of_atc_sessions
       FROM hour_wise_sales
       WHERE date >= ? AND date <= ?`,
          { type: QueryTypes.SELECT, replacements: [start, end] }
        );

        const rowMap = new Map();
        for (const row of rows) {
          if (!row?.date) continue;
          const hourVal = typeof row.hour === 'number' ? row.hour : Number(row.hour);
          if (!Number.isFinite(hourVal) || hourVal < 0 || hourVal > 23) continue;
          const key = `${row.date}#${hourVal}`;
          rowMap.set(key, {
            sales: Number(row.total_sales || 0),
            sessions: Number(row.raw_number_of_sessions || 0),
            adjusted_sessions: Number(row.adjusted_number_of_sessions || 0),
            raw_sessions: Number(row.raw_number_of_sessions || 0),
            orders: Number(row.number_of_orders || 0),
            atc: Number(row.number_of_atc_sessions || 0),
          });
        }

        const startDate = new Date(`${start}T00:00:00Z`);
        const endDate = new Date(`${end}T00:00:00Z`);
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
          return res.status(400).json({ error: 'Unable to parse date range' });
        }

        const DAY_MS = 24 * 3600_000;
        let points = [];
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

        if (aggregate === 'avg-by-hour' || aggregate === 'avg-hour' || aggregate === 'avg') {
          const buckets = [];
          for (let ts = startDate.getTime(); ts <= endDate.getTime(); ts += DAY_MS) {
            const dt = new Date(ts);
            const yyyy = dt.getUTCFullYear();
            const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(dt.getUTCDate()).padStart(2, '0');
            const dateStr = `${yyyy}-${mm}-${dd}`;
            const maxHour = dateStr === end ? alignHour : 23;
            for (let hour = 0; hour <= maxHour; hour += 1) buckets.push({ date: dateStr, hour });
          }

          const hourAcc = Array.from({ length: 24 }, () => ({ count: 0, sales: 0, sessions: 0, adjusted_sessions: 0, raw_sessions: 0, orders: 0, atc: 0 }));
          for (const { date: d, hour } of buckets) {
            const metrics = rowMap.get(`${d}#${hour}`) || { sales: 0, sessions: 0, orders: 0, atc: 0 };
            const acc = hourAcc[hour];
            acc.count += 1;
            acc.sales += metrics.sales;
            acc.sessions += metrics.sessions;
            acc.adjusted_sessions += (metrics.adjusted_sessions || 0);
            acc.raw_sessions += (metrics.raw_sessions || 0);
            acc.orders += metrics.orders;
            acc.atc += metrics.atc;
          }

          const maxHourForSeries = end === todayIst ? alignHour : 23;
          points = Array.from({ length: maxHourForSeries + 1 }, (_, hour) => {
            const acc = hourAcc[hour];
            const avgSales = acc.count ? acc.sales / acc.count : 0;
            const avgSessions = acc.count ? acc.sessions / acc.count : 0;
            const avgAdjustedSessions = acc.count ? acc.adjusted_sessions / acc.count : 0;
            const avgRawSessions = acc.count ? acc.raw_sessions / acc.count : 0;
            const avgOrders = acc.count ? acc.orders / acc.count : 0;
            const avgAtc = acc.count ? acc.atc / acc.count : 0;
            const cvrRatio = avgSessions > 0 ? avgOrders / avgSessions : 0;
            const label = `${String(hour).padStart(2, '0')}:00`;
            return { hour, label, metrics: { sales: avgSales, sessions: avgSessions, adjusted_sessions: avgAdjustedSessions, raw_sessions: avgRawSessions, orders: avgOrders, atc: avgAtc, cvr_ratio: cvrRatio, cvr_percent: cvrRatio * 100 } };
          });
        } else {
          const buckets = [];
          for (let ts = startDate.getTime(); ts <= endDate.getTime(); ts += DAY_MS) {
            const dt = new Date(ts);
            const yyyy = dt.getUTCFullYear();
            const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(dt.getUTCDate()).padStart(2, '0');
            const dateStr = `${yyyy}-${mm}-${dd}`;
            const maxHour = dateStr === end ? alignHour : 23;
            for (let hour = 0; hour <= maxHour; hour += 1) {
              buckets.push({ date: dateStr, hour });
            }
          }

          points = buckets.map(({ date: bucketDate, hour }) => {
            const metrics = rowMap.get(`${bucketDate}#${hour}`) || { sales: 0, sessions: 0, orders: 0, atc: 0 };
            const cvrRatio = metrics.sessions > 0 ? metrics.orders / metrics.sessions : 0;
            const monthIndex = Math.max(0, Math.min(11, Number(bucketDate.slice(5, 7)) - 1));
            const dayNum = Number(bucketDate.slice(8, 10));
            const label = `${String(dayNum).padStart(2, '0')} ${monthNames[monthIndex]} ${String(hour).padStart(2, '0')}:00`;
            return { date: bucketDate, hour, label, metrics: { sales: metrics.sales, sessions: metrics.sessions, adjusted_sessions: metrics.adjusted_sessions || 0, raw_sessions: metrics.raw_sessions || 0, orders: metrics.orders, atc: metrics.atc, cvr_ratio: cvrRatio, cvr_percent: cvrRatio * 100 } };
          });
        }

        const prevWin = previousWindow(start, end);
        let comparison = null;
        if (prevWin?.prevStart && prevWin?.prevEnd) {
          const comparisonAlignHour = end === todayIst ? alignHour : 23;
          const comparisonRows = await req.brandDb.sequelize.query(
            `SELECT date, hour, total_sales, number_of_orders,
    COALESCE(adjusted_number_of_sessions, number_of_sessions) AS number_of_sessions,
    adjusted_number_of_sessions,
    number_of_sessions AS raw_number_of_sessions,
    number_of_atc_sessions
         FROM hour_wise_sales
         WHERE date >= ? AND date <= ?`,
            { type: QueryTypes.SELECT, replacements: [prevWin.prevStart, prevWin.prevEnd] }
          );

          const comparisonRowMap = new Map();
          for (const row of comparisonRows) {
            if (!row?.date) continue;
            const hourVal = typeof row.hour === 'number' ? row.hour : Number(row.hour);
            if (!Number.isFinite(hourVal) || hourVal < 0 || hourVal > 23) continue;
            const key = `${row.date}#${hourVal}`;
            comparisonRowMap.set(key, {
              sales: Number(row.total_sales || 0),
              sessions: Number(row.raw_number_of_sessions || 0),
              adjusted_sessions: Number(row.adjusted_number_of_sessions || 0),
              raw_sessions: Number(row.raw_number_of_sessions || 0),
              orders: Number(row.number_of_orders || 0),
              atc: Number(row.number_of_atc_sessions || 0),
            });
          }

          const comparisonBuckets = [];
          for (let ts = parseIsoDate(prevWin.prevStart).getTime(); ts <= parseIsoDate(prevWin.prevEnd).getTime(); ts += DAY_MS) {
            const dt = new Date(ts);
            const yyyy = dt.getUTCFullYear();
            const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(dt.getUTCDate()).padStart(2, '0');
            const dateStr = `${yyyy}-${mm}-${dd}`;
            const maxHour = dateStr === prevWin.prevEnd ? comparisonAlignHour : 23;
            for (let hour = 0; hour <= maxHour; hour += 1) comparisonBuckets.push({ date: dateStr, hour });
          }

          const hourAcc = Array.from({ length: 24 }, () => ({ count: 0, sales: 0, sessions: 0, adjusted_sessions: 0, raw_sessions: 0, orders: 0, atc: 0 }));
          for (const { date: bucketDate, hour } of comparisonBuckets) {
            const metrics = comparisonRowMap.get(`${bucketDate}#${hour}`) || { sales: 0, sessions: 0, orders: 0, atc: 0 };
            const acc = hourAcc[hour];
            acc.count += 1;
            acc.sales += metrics.sales;
            acc.sessions += metrics.sessions;
            acc.adjusted_sessions += (metrics.adjusted_sessions || 0);
            acc.raw_sessions += (metrics.raw_sessions || 0);
            acc.orders += metrics.orders;
            acc.atc += metrics.atc;
          }

          const avgByHour = hourAcc.map((acc) => {
            const avgSales = acc.count ? acc.sales / acc.count : 0;
            const avgSessions = acc.count ? acc.sessions / acc.count : 0;
            const avgAdjustedSessions = acc.count ? acc.adjusted_sessions / acc.count : 0;
            const avgRawSessions = acc.count ? acc.raw_sessions / acc.count : 0;
            const avgOrders = acc.count ? acc.orders / acc.count : 0;
            const avgAtc = acc.count ? acc.atc / acc.count : 0;
            const cvrRatio = avgSessions > 0 ? avgOrders / avgSessions : 0;
            return { sales: avgSales, sessions: avgSessions, adjusted_sessions: avgAdjustedSessions, raw_sessions: avgRawSessions, orders: avgOrders, atc: avgAtc, cvr_ratio: cvrRatio, cvr_percent: cvrRatio * 100 };
          });

          const baseHours = points.map(p => p.hour);
          const comparisonPoints = baseHours.map((hour) => {
            const avg = avgByHour[hour] || { sales: 0, sessions: 0, orders: 0, atc: 0, cvr_ratio: 0, cvr_percent: 0 };
            return { hour, label: `${String(hour).padStart(2,'0')}:00`, metrics: avg };
          });

          comparison = { range: { start: prevWin.prevStart, end: prevWin.prevEnd }, alignHour: comparisonAlignHour, points: comparisonPoints, hourSampleCount: hourAcc.map((acc) => acc.count) };
        }

        return res.json({ range: { start, end }, timezone: 'IST', alignHour, points, comparison });
      } catch (e) { console.error('[hourly-trend] failed', e); return res.status(500).json({ error: 'Internal server error' }); }
    },

    dailyTrend: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
        if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
        const { start, end } = parsed.data;
        if (!start || !end) return res.status(400).json({ error: 'Both start and end dates are required' });
        if (start > end) return res.status(400).json({ error: 'Start date must be on or before end date' });

        const DAY_MS = 24 * 3600_000;
        const sTs = parseIsoDate(start).getTime();
        const eTs = parseIsoDate(end).getTime();
        const dayList = [];
        for (let ts = sTs; ts <= eTs; ts += DAY_MS) {
          dayList.push(formatIsoDate(new Date(ts)));
        }

        const sql = `
          SELECT date, 
            SUM(total_sales) AS sales,
            SUM(number_of_orders) AS orders,
            SUM(COALESCE(adjusted_number_of_sessions, number_of_sessions)) AS sessions,
            SUM(COALESCE(adjusted_number_of_sessions, 0)) AS adjusted_sessions,
            SUM(number_of_sessions) AS raw_sessions,
            SUM(number_of_atc_sessions) AS atc
          FROM hour_wise_sales
          WHERE date >= ? AND date <= ?
          GROUP BY date
          ORDER BY date ASC`;
        const rows = await req.brandDb.sequelize.query(sql, { type: QueryTypes.SELECT, replacements: [start, end] });
        const map = new Map(rows.map(r => [r.date, { sales: Number(r.sales || 0), orders: Number(r.orders || 0), sessions: Number(r.sessions || 0), adjusted_sessions: Number(r.adjusted_sessions || 0), raw_sessions: Number(r.raw_sessions || 0), atc: Number(r.atc || 0) }]));

        const overallRows = await req.brandDb.sequelize.query(
          `SELECT date, total_sessions, adjusted_total_sessions FROM overall_summary WHERE date >= ? AND date <= ?`,
          { type: QueryTypes.SELECT, replacements: [start, end] }
        );
        const overallMap = new Map(overallRows.map(r => [r.date, { total_sessions: Number(r.total_sessions || 0), adjusted_total_sessions: r.adjusted_total_sessions == null ? null : Number(r.adjusted_total_sessions) }]));

        const points = dayList.map(d => {
          const metrics = map.get(d) || { sales: 0, orders: 0, sessions: 0, adjusted_sessions: 0, raw_sessions: 0, atc: 0 };
          const over = overallMap.get(d);
          const bestSession = over && over.adjusted_total_sessions != null ? Number(over.adjusted_total_sessions) : metrics.sessions;
          const cvrRatio = bestSession > 0 ? metrics.orders / bestSession : 0;
          return { date: d, metrics: { sales: metrics.sales, orders: metrics.orders, sessions: bestSession, adjusted_sessions: metrics.adjusted_sessions, raw_sessions: metrics.raw_sessions, atc: metrics.atc, cvr_ratio: cvrRatio, cvr_percent: cvrRatio * 100 } };
        });

        let comparison = null;
        const prevWin = previousWindow(start, end);
        if (prevWin?.prevStart && prevWin?.prevEnd) {
          const rowsPrev = await req.brandDb.sequelize.query(sql, { type: QueryTypes.SELECT, replacements: [prevWin.prevStart, prevWin.prevEnd] });
          const mapPrev = new Map(rowsPrev.map(r => [r.date, { sales: Number(r.sales || 0), orders: Number(r.orders || 0), sessions: Number(r.sessions || 0), adjusted_sessions: Number(r.adjusted_sessions || 0), raw_sessions: Number(r.raw_sessions || 0), atc: Number(r.atc || 0) }]));
          const overallRowsPrev = await req.brandDb.sequelize.query(
            `SELECT date, total_sessions, adjusted_total_sessions FROM overall_summary WHERE date >= ? AND date <= ?`,
            { type: QueryTypes.SELECT, replacements: [prevWin.prevStart, prevWin.prevEnd] }
          );
          const overallMapPrev = new Map(overallRowsPrev.map(r => [r.date, { total_sessions: Number(r.total_sessions || 0), adjusted_total_sessions: r.adjusted_total_sessions == null ? null : Number(r.adjusted_total_sessions) }]));

          const prevPoints = [];
          for (let ts = parseIsoDate(prevWin.prevStart).getTime(); ts <= parseIsoDate(prevWin.prevEnd).getTime(); ts += DAY_MS) {
            const d = formatIsoDate(new Date(ts));
            const metrics = mapPrev.get(d) || { sales: 0, orders: 0, sessions: 0, adjusted_sessions: 0, raw_sessions: 0, atc: 0 };
            const over = overallMapPrev.get(d);
            const bestSession = over && over.adjusted_total_sessions != null ? Number(over.adjusted_total_sessions) : metrics.sessions;
            const cvrRatio = bestSession > 0 ? metrics.orders / bestSession : 0;
            prevPoints.push({ date: d, metrics: { sales: metrics.sales, orders: metrics.orders, sessions: bestSession, adjusted_sessions: metrics.adjusted_sessions, raw_sessions: metrics.raw_sessions, atc: metrics.atc, cvr_ratio: cvrRatio, cvr_percent: cvrRatio * 100 } });
          }
          comparison = { range: { start: prevWin.prevStart, end: prevWin.prevEnd }, points: prevPoints };
        }

        return res.json({
          range: { start, end },
          points,
          days: points, // alias for frontend expecting `days`
          comparison: comparison ? { ...comparison, days: comparison.points } : null,
        });
      } catch (e) { console.error('[daily-trend] failed', e); return res.status(500).json({ error: 'Internal server error' }); }
    },

    monthlyTrend: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
        if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
        const { start, end } = parsed.data;
        if (!start || !end) return res.status(400).json({ error: 'Both start and end dates are required' });

        const sql = `
          SELECT 
            DATE_FORMAT(date, '%Y-%m-01') AS month_start,
            MIN(date) AS start_date,
            MAX(date) AS end_date,
            SUM(total_sales) AS sales,
            SUM(number_of_orders) AS orders,
            SUM(number_of_atc_sessions) AS atc
          FROM hour_wise_sales
          WHERE date >= ? AND date <= ?
          GROUP BY month_start
          ORDER BY month_start ASC`;
        
        const sessionsSql = `
          SELECT 
            DATE_FORMAT(date, '%Y-%m-01') AS month_start,
            SUM(total_sessions) AS total_sessions,
            SUM(adjusted_total_sessions) AS adjusted_total_sessions
          FROM overall_summary
          WHERE date >= ? AND date <= ?
          GROUP BY month_start
          ORDER BY month_start ASC`;

        const [rows, sessionsRows] = await Promise.all([
          req.brandDb.sequelize.query(sql, { type: QueryTypes.SELECT, replacements: [start, end] }),
          req.brandDb.sequelize.query(sessionsSql, { type: QueryTypes.SELECT, replacements: [start, end] })
        ]);

        const sessionsMap = new Map(sessionsRows.map(r => [r.month_start, r]));

        const points = rows.map(r => {
          const s = sessionsMap.get(r.month_start);
          const bestSession = s && s.adjusted_total_sessions != null ? Number(s.adjusted_total_sessions) : Number(s?.total_sessions || 0);
          const orders = Number(r.orders || 0);
          const cvrRatio = bestSession > 0 ? orders / bestSession : 0;
          return {
            date: r.month_start,
            startDate: r.start_date,
            endDate: r.end_date,
            metrics: {
              sales: Number(r.sales || 0),
              orders,
              sessions: bestSession,
              atc: Number(r.atc || 0),
              cvr_ratio: cvrRatio,
              cvr_percent: cvrRatio * 100
            }
          };
        });

        let comparison = null;
        const prevWin = previousWindow(start, end);
        if (prevWin?.prevStart && prevWin?.prevEnd) {
           const [rowsPrev, sessionsRowsPrev] = await Promise.all([
            req.brandDb.sequelize.query(sql, { type: QueryTypes.SELECT, replacements: [prevWin.prevStart, prevWin.prevEnd] }),
            req.brandDb.sequelize.query(sessionsSql, { type: QueryTypes.SELECT, replacements: [prevWin.prevStart, prevWin.prevEnd] })
          ]);
          const sessionsMapPrev = new Map(sessionsRowsPrev.map(r => [r.month_start, r]));
          const prevPoints = rowsPrev.map(r => {
            const s = sessionsMapPrev.get(r.month_start);
            const bestSession = s && s.adjusted_total_sessions != null ? Number(s.adjusted_total_sessions) : Number(s?.total_sessions || 0);
            const orders = Number(r.orders || 0);
            const cvrRatio = bestSession > 0 ? orders / bestSession : 0;
            return {
              date: r.month_start,
              startDate: r.start_date,
              endDate: r.end_date,
              metrics: {
                sales: Number(r.sales || 0),
                orders,
                sessions: bestSession,
                atc: Number(r.atc || 0),
                cvr_ratio: cvrRatio,
                cvr_percent: cvrRatio * 100
              }
            };
          });
          comparison = { range: { start: prevWin.prevStart, end: prevWin.prevEnd }, points: prevPoints };
        }

        return res.json({
          range: { start, end },
          points,
          months: points,
          comparison: comparison ? { ...comparison, months: comparison.points } : null,
        });
      } catch (e) { console.error('[monthly-trend] failed', e); return res.status(500).json({ error: 'Internal server error' }); }
    },

    productConversion: async (req, res) => {
      try {
        const todayStr = formatIsoDate(new Date());
        const parsed = RangeSchema.safeParse({ start: req.query.start || todayStr, end: req.query.end || todayStr });
        if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
        const { start, end } = parsed.data;
        if (start && end && start > end) return res.status(400).json({ error: 'start must be on or before end' });

        const conn = req.brandDb?.sequelize;
        if (!conn) return res.status(500).json({ error: 'Brand DB connection unavailable' });

        const page = Math.max(1, Number(req.query.page) || 1);
        const pageSizeRaw = Number(req.query.page_size) || 10;
        const pageSize = Math.min(Math.max(1, pageSizeRaw), 200);
        const sortBy = (req.query.sort_by || 'sessions').toString().toLowerCase();
        const sortDir = (req.query.sort_dir || 'desc').toString().toLowerCase();

        const allowedSort = new Map([
          ['sessions', 'sessions'],
          ['atc', 'atc'],
          ['orders', 'orders'],
          ['sales', 'sales'],
          ['cvr', 'cvr'],
          ['landing_page_path', 'landing_page_path'],
        ]);
        const sortCol = allowedSort.get(sortBy) || 'sessions';
        const dir = sortDir === 'asc' ? 'ASC' : 'DESC';

        const replacements = [start, end, start, end];
        const baseCte = `
          WITH orders_60d AS (
            SELECT
              product_id,
              COUNT(DISTINCT order_name) AS orders,
              SUM(line_item_price * line_item_quantity) AS sales
            FROM shopify_orders
            WHERE created_date >= ? AND created_date <= ?
              AND product_id IS NOT NULL
            GROUP BY product_id
          ),
          sessions_60d AS (
            SELECT
              product_id,
              landing_page_path,
              SUM(sessions) AS sessions,
              SUM(sessions_with_cart_additions) AS atc
            FROM mv_product_sessions_by_path_daily
            WHERE date >= ? AND date <= ?
              AND product_id IS NOT NULL
            GROUP BY product_id, landing_page_path
          )
        `;

        const sql = `
          ${baseCte}
          SELECT
            s.landing_page_path,
            s.sessions,
            s.atc,
            COALESCE(o.orders, 0) AS orders,
            COALESCE(o.sales, 0) AS sales,
            CASE WHEN s.sessions > 0 THEN ROUND(COALESCE(o.orders, 0) / s.sessions * 100, 4) ELSE 0 END AS cvr
          FROM sessions_60d s
          LEFT JOIN orders_60d o
            ON s.product_id = o.product_id
          ORDER BY ${sortCol} ${dir}
          LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
        `;

        const countSql = `
          ${baseCte}
          SELECT COUNT(*) AS total_count
          FROM sessions_60d s
        `;

        const [rows, countRows] = await Promise.all([
          conn.query(sql, { type: QueryTypes.SELECT, replacements }),
          conn.query(countSql, { type: QueryTypes.SELECT, replacements }),
        ]);
        const total = Number(countRows?.[0]?.total_count || 0);

        return res.json({
          range: { start, end },
          page,
          page_size: pageSize,
          total_count: total,
          rows,
          sort: { by: sortBy, dir: sortDir },
        });
      } catch (e) {
        console.error('[product-conversion] failed', e);
        return res.status(500).json({ error: 'Internal server error' });
      }
    },

    productConversionCsv: async (req, res) => {
      try {
        const todayStr = formatIsoDate(new Date());
        const parsed = RangeSchema.safeParse({ start: req.query.start || todayStr, end: req.query.end || todayStr });
        if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
        const { start, end } = parsed.data;
        if (start && end && start > end) return res.status(400).json({ error: 'start must be on or before end' });

        const conn = req.brandDb?.sequelize;
        if (!conn) return res.status(500).json({ error: 'Brand DB connection unavailable' });

        const sortBy = (req.query.sort_by || 'sessions').toString().toLowerCase();
        const sortDir = (req.query.sort_dir || 'desc').toString().toLowerCase();

        const allowedSort = new Map([
          ['sessions', 'sessions'],
          ['atc', 'atc'],
          ['orders', 'orders'],
          ['sales', 'sales'],
          ['cvr', 'cvr'],
          ['landing_page_path', 'landing_page_path'],
        ]);
        const sortCol = allowedSort.get(sortBy) || 'sessions';
        const dir = sortDir === 'asc' ? 'ASC' : 'DESC';

        const replacements = [start, end, start, end];
        const fullSql = `
          WITH orders_60d AS (
            SELECT
              product_id,
              COUNT(DISTINCT order_name) AS orders,
              SUM(line_item_price * line_item_quantity) AS sales
            FROM shopify_orders
            WHERE created_date >= ? AND created_date <= ?
              AND product_id IS NOT NULL
            GROUP BY product_id
          ),
          sessions_60d AS (
            SELECT
              product_id,
              landing_page_path,
              SUM(sessions) AS sessions,
              SUM(sessions_with_cart_additions) AS atc
            FROM mv_product_sessions_by_path_daily
            WHERE date >= ? AND date <= ?
              AND product_id IS NOT NULL
            GROUP BY product_id, landing_page_path
          )
          SELECT
            s.landing_page_path,
            s.sessions,
            s.atc,
            COALESCE(o.orders, 0) AS orders,
            COALESCE(o.sales, 0) AS sales,
            CASE WHEN s.sessions > 0 THEN ROUND(COALESCE(o.orders, 0) / s.sessions * 100, 4) ELSE 0 END AS cvr
          FROM sessions_60d s
          LEFT JOIN orders_60d o
            ON s.product_id = o.product_id
          ORDER BY ${sortCol} ${dir}
        `;
        const csvRows = await conn.query(fullSql, { type: QueryTypes.SELECT, replacements });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="product_conversion.csv"');
        const headers = ['landing_page_path', 'sessions', 'atc', 'orders', 'sales', 'cvr'];
        const escapeCsv = (val) => {
          if (val === null || val === undefined) return '';
          const str = String(val);
          if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
          return str;
        };
        const lines = [headers.join(',')];
        for (const r of csvRows) {
          lines.push([
            escapeCsv(r.landing_page_path),
            Number(r.sessions || 0),
            Number(r.atc || 0),
            Number(r.orders || 0),
            Number(r.sales || 0),
            Number(r.cvr || 0),
          ].join(','));
        }
        return res.send(lines.join('\n'));
      } catch (e) {
        console.error('[product-conversion-csv] failed', e);
        return res.status(500).json({ error: 'Internal server error' });
      }
    },

    hourlySalesCompare: async (req, res) => {
      try {
        const brandKey = (req.query.brand_key || req.query.brand || '').toString().trim().toUpperCase();
        if (!brandKey) return res.status(400).json({ error: 'brand_key required' });
        const map = getBrands();
        if (!map[brandKey]) return res.status(400).json({ error: 'Unknown brand_key' });
        const brandConn = await getBrandConnection(map[brandKey]);
        const daysParam = (req.query.days || '').toString();
        const N = Number(daysParam) || 1;
        if (N <= 0 || N > 30) return res.status(400).json({ error: 'days must be between 1 and 30' });
        const todayIst = new Date();
        const bucketsIst = [];
        for (let i = 0; i < N; i += 1) {
          const ist = new Date(todayIst.getTime() + (330 * 60 * 1000));
          ist.setUTCDate(ist.getUTCDate() - i);
          const yyyy = ist.getUTCFullYear();
          const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
          const dd = String(ist.getUTCDate()).padStart(2, '0');
          const maxHour = i === 0 ? ist.getUTCHours() : 23;
          for (let hour = 0; hour <= maxHour; hour += 1) {
            bucketsIst.push({ date: `${yyyy}-${mm}-${dd}`, hour });
          }
        }
        const yBucketsIst = bucketsIst.map(b => {
          const ist = new Date(Date.UTC(Number(b.date.slice(0, 4)), Number(b.date.slice(5, 7)) - 1, Number(b.date.slice(8, 10)), b.hour, 0, 0, 0));
          const prev = new Date(ist.getTime() - 24 * 3600_000);
          const yyyy = prev.getUTCFullYear();
          const mm = String(prev.getUTCMonth() + 1).padStart(2, '0');
          const dd = String(prev.getUTCDate()).padStart(2, '0');
          return { date: `${yyyy}-${mm}-${dd}`, hour: prev.getUTCHours() };
        });

        const where = Array(N).fill('(date = ? AND hour = ?)').join(' OR ');
        const paramsCurrent = bucketsIst.flatMap(b => [b.date, b.hour]);
        const paramsY = yBucketsIst.flatMap(b => [b.date, b.hour]);

        const sql = `SELECT date, hour, total_sales FROM hour_wise_sales WHERE ${where}`;
        const [rowsCurrent, rowsY] = await Promise.all([
          brandConn.sequelize.query(sql, { type: QueryTypes.SELECT, replacements: paramsCurrent }),
          brandConn.sequelize.query(sql, { type: QueryTypes.SELECT, replacements: paramsY }),
        ]);

        const mapCurrent = new Map();
        for (const r of rowsCurrent) {
          const k = `${r.date}#${r.hour}`;
          mapCurrent.set(k, Number(r.total_sales || 0));
        }
        const mapY = new Map();
        for (const r of rowsY) {
          const k = `${r.date}#${r.hour}`;
          mapY.set(k, Number(r.total_sales || 0));
        }

        const labels = bucketsIst.map(b => `${String(b.hour).padStart(2, '0')}:00`);
        const current = bucketsIst.map(b => mapCurrent.get(`${b.date}#${b.hour}`) || 0);
        const yesterday = yBucketsIst.map(b => mapY.get(`${b.date}#${b.hour}`) || 0);

        return res.json({ labels, series: { current, yesterday }, tz: 'IST' });
      } catch (e) {
        console.error('[hourly-sales-compare] failed', e);
        return res.status(500).json({ error: 'Internal server error' });
      }
    },


    diagnoseTotalOrders: (sequelize) => async (req, res) => {
      try {
        const start = req.query.start;
        const end = req.query.end;
        const [envInfo] = await sequelize.query("SELECT DATABASE() AS db, @@hostname AS host, @@version AS version", { type: QueryTypes.SELECT });
        const sqlTotal = "SELECT COALESCE(SUM(total_orders),0) AS total FROM overall_summary WHERE date >= ? AND date <= ?";
        const sqlDaily = "SELECT date, SUM(total_orders) AS total_orders FROM overall_summary WHERE date >= ? AND date <= ? GROUP BY date ORDER BY date";
        const [totalRow] = await sequelize.query(sqlTotal, { type: QueryTypes.SELECT, replacements: [start, end] });
        const daily = await sequelize.query(sqlDaily, { type: QueryTypes.SELECT, replacements: [start, end] });
        res.json({ connecting_to: envInfo, range: { start, end }, sql_total: sqlTotal, sql_params: [start, end], total_orders: Number(totalRow.total || 0), daily_breakdown: daily.map(r => ({ date: r.date, total_orders: Number(r.total_orders || 0) })) });
      } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
    },

    deltaSummary: async (req, res) => {
      try {
        const brandQuery = (req.query.brand || req.query.brand_key || (req.brandKey)).toString().trim();
        if (!brandQuery) return res.status(400).json({ error: "Missing brand_key" });

        const todayStr = formatIsoDate(new Date());
        const start = (req.query.start || req.query.date || todayStr).toString();
        const end = (req.query.end || req.query.date || start).toString();
        if (start > end) return res.status(400).json({ error: 'start must be on or before end' });

        if (!req.brandDb && req.brandConfig) {
          try {
            req.brandDb = await getBrandConnection(req.brandConfig);
          } catch (connErr) {
            console.error("Lazy connection failed", connErr);
          }
        }
        const conn = req.brandDb ? req.brandDb.sequelize : null;
        if (!conn) throw new Error("Database connection missing for delta summary");

        const align = (req.query.align || '').toString().toLowerCase();
        const compare = (req.query.compare || '').toString().toLowerCase();

        const [orders, sales, sessions, atc, aov, cvr] = await Promise.all([
          calcTotalOrdersDelta({ start, end, align, compare, conn }),
          calcTotalSalesDelta({ start, end, align, compare, conn }),
          calcTotalSessionsDelta({ start, end, align, compare, conn }),
          calcAtcSessionsDelta({ start, end, align, compare, conn }),
          calcAovDelta({ start, end, align, compare, conn }),
          calcCvrDelta({ start, end, align, compare, conn })
        ]);

        const prevWin = previousWindow(start, end);
        const response = {
          range: { start, end },
          prev_range: prevWin ? { start: prevWin.prevStart, end: prevWin.prevEnd } : null,
          metrics: {
            total_orders: orders,
            total_sales: sales,
            total_sessions: sessions,
            total_atc_sessions: atc,
            average_order_value: aov,
            conversion_rate: cvr
          }
        };

        return res.json(response);
      } catch (e) {
        console.error('[deltaSummary] Error:', e);
        return res.status(500).json({ error: 'Internal server error', details: e.message });
      }
    },

    dashboardSummary: async (req, res) => {
      try {
        const brandQuery = (req.query.brand || req.query.brand_key || (req.brandKey)).toString().trim();
        if (!brandQuery) return res.status(400).json({ error: "Missing brand_key" });

        const todayStr = formatIsoDate(new Date());
        const start = (req.query.start || req.query.date || todayStr).toString();
        const end = (req.query.end || req.query.date || start).toString();

        if (start > end) return res.status(400).json({ error: 'start must be on or before end' });

        const traceStart = req._reqStart || Date.now();
        const spans = [];
        const mark = (label, since) => spans.push({ label, ms: Date.now() - (since || traceStart) });
        mark('params');

        const isSingleDay = start === end;
        const prevWin = previousWindow(start, end);
        const prevStart = prevWin?.prevStart;
        const prevEnd = prevWin?.prevEnd;

        console.log(`[SUMMARY] Fetching for ${brandQuery} range ${start} to ${end}${prevStart && prevEnd ? ` (prev: ${prevStart} to ${prevEnd})` : ''}`);
        const cacheFetchStart = Date.now();

        // Batch fetch from cache when single-day so we can reuse existing cache keys.
        const [cached, cachedPrev] = isSingleDay
          ? await fetchCachedMetricsBatch(brandQuery, [start, prevStart || prevDayStr(start)])
          : [null, null];
        mark('cache_fetch', cacheFetchStart);

        const getMetricsForRange = async (s, e, cachedData) => {
          if (!s || !e) return null;
          if (isSingleDay && cachedData) {
            return {
              total_orders: cachedData.total_orders,
              total_sales: cachedData.total_sales,
              total_sessions: cachedData.total_sessions,
              total_atc_sessions: cachedData.total_atc_sessions,
              average_order_value: cachedData.average_order_value,
              conversion_rate: cachedData.conversion_rate,
              conversion_rate_percent: cachedData.conversion_rate,
              source: 'cache'
            };
          }

          // Ensure DB connection
          if (!req.brandDb && req.brandConfig) {
            console.log(`[LAZY CONNECT] Connecting to ${req.brandConfig.key} for fallback`);
            try {
              req.brandDb = await getBrandConnection(req.brandConfig);
            } catch (connErr) {
              console.error("Lazy connection failed", connErr);
            }
          }
          const conn = req.brandDb ? req.brandDb.sequelize : null;
          if (!conn) throw new Error("Database connection missing for fallback (Cache Miss & DB Fail)");

          const [sales, orders, sessions, atc, cvrObj, aovObj] = await Promise.all([
            rawSum('total_sales', { start: s, end: e, conn }),
            rawSum('total_orders', { start: s, end: e, conn }),
            rawSum('total_sessions', { start: s, end: e, conn }),
            rawSum('total_atc_sessions', { start: s, end: e, conn }),
            computeCVR({ start: s, end: e, conn }),
            aovForRange({ start: s, end: e, conn })
          ]);

          const aovVal = typeof aovObj === 'object' && aovObj !== null ? Number(aovObj.aov || 0) : Number(aovObj || 0);
          return {
            total_orders: orders,
            total_sales: sales,
            total_sessions: sessions,
            total_atc_sessions: atc,
            average_order_value: aovVal,
            conversion_rate: cvrObj.cvr,
            conversion_rate_percent: cvrObj.cvr_percent,
            source: 'db'
          };
        };

        const [current, previous] = await Promise.all([
          (async () => {
            const s = Date.now();
            const resCur = await getMetricsForRange(start, end, cached);
            mark('current_fetch', s);
            return resCur;
          })(),
          (async () => {
            const s = Date.now();
            const resPrev = await getMetricsForRange(prevStart, prevEnd, cachedPrev);
            mark('previous_fetch', s);
            return resPrev;
          })()
        ]);

        const calcDelta = (cur, prev) => {
          const diff = cur - prev;
          const diff_pct = prev > 0 ? (diff / prev) * 100 : (cur > 0 ? 100 : 0);
          const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
          return { diff, diff_pct, direction };
        };

        const response = {
          range: { start, end },
          prev_range: prevStart && prevEnd ? { start: prevStart, end: prevEnd } : null,
          metrics: {
            total_orders: {
              value: current?.total_orders || 0,
              previous: previous?.total_orders || 0,
              ...calcDelta(current?.total_orders || 0, previous?.total_orders || 0)
            },
            total_sales: {
              value: current?.total_sales || 0,
              previous: previous?.total_sales || 0,
              ...calcDelta(current?.total_sales || 0, previous?.total_sales || 0)
            },
            average_order_value: {
              value: current?.average_order_value || 0,
              previous: previous?.average_order_value || 0,
              ...calcDelta(current?.average_order_value || 0, previous?.average_order_value || 0)
            },
            conversion_rate: {
              value: current?.conversion_rate_percent || 0,
              previous: previous?.conversion_rate_percent || 0,
              ...calcDelta(current?.conversion_rate_percent || 0, previous?.conversion_rate_percent || 0)
            },
            total_sessions: {
              value: current?.total_sessions || 0,
              previous: previous?.total_sessions || 0,
              ...calcDelta(current?.total_sessions || 0, previous?.total_sessions || 0)
            },
            total_atc_sessions: {
              value: current?.total_atc_sessions || 0,
              previous: previous?.total_atc_sessions || 0,
              ...calcDelta(current?.total_atc_sessions || 0, previous?.total_atc_sessions || 0)
            }
          },
          sources: { current: current?.source || 'db', previous: previous?.source || 'db' }
        };

        console.log(
          `[SUMMARY TRACE] ${brandQuery} ${start}->${end} steps=${spans.map(s => `${s.label}:${s.ms}ms`).join(' | ')} total=${Date.now() - traceStart}ms`
        );

        return res.json(response);
      } catch (e) {
        console.error('[dashboardSummary] Error:', e);
        return res.status(500).json({ error: 'Internal server error', details: e.message });
      }
    },
  };
}

module.exports = { buildMetricsController };
