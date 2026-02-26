const { QueryTypes } = require('sequelize');
const redisClient = require('../lib/redis');
const logger = require('../utils/logger');
const { RangeSchema, isoDate } = require('../validation/schemas');
const { computeAOV, computeCVR, computeCVRForDay, computeTotalSales, computeTotalOrders, computeFunnelStats, deltaForSum, deltaForAOV, computePercentDelta, avgForRange, aovForRange, cvrForRange, rawSum, computeMetricDelta, computeTotalSessions, computeAtcSessions, hasUtmFilters, appendUtmWhere, extractUtmParam, buildDeviceTypeUserAgentClause, computeSessionsFromDeviceColumns, extractFilters } = require('../utils/metricsUtils');
const { previousWindow, prevDayStr, parseIsoDate, formatIsoDate, shiftDays } = require('../utils/dateUtils');
const { requireBrandKey } = require('../utils/brandHelpers');
const { getBrands } = require('../config/brands');
const { getBrandConnection } = require('../lib/brandConnectionManager');

const SHOP_DOMAIN_CACHE = new Map();
const pad2 = (n) => String(n).padStart(2, '0');
const MEM_CACHE = new Map();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds
const IST_OFFSET_MIN = 330;

async function calcTotalOrdersDelta({ start, end, align, conn, filters }) {
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

    let rangeFilter = `created_date >= ? AND created_date <= ? AND created_time < ?`;
    const curReplacements = [rangeStart, rangeEnd, cutoffTime];

    if (filters) {
      rangeFilter = appendUtmWhere(rangeFilter, curReplacements, filters);
    }

    const prevWin = previousWindow(rangeStart, rangeEnd);
    const countSql = `SELECT COUNT(DISTINCT order_name) AS cnt FROM shopify_orders WHERE ${rangeFilter}`;

    // For previous window, we need same filters
    const prevReplacements = prevWin ? [prevWin.prevStart, prevWin.prevEnd, cutoffTime] : [];
    if (prevWin && filters) {
      appendUtmWhere("", prevReplacements, filters);
    }

    const currPromise = conn.query(countSql, { type: QueryTypes.SELECT, replacements: curReplacements });
    const prevPromise = prevWin ? conn.query(countSql, { type: QueryTypes.SELECT, replacements: prevReplacements }) : Promise.resolve([{ cnt: 0 }]);
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

async function calcTotalSalesDelta({ start, end, align, compare, conn, filters }) {
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

    let rangeFilter = `created_date >= ? AND created_date <= ? AND created_time < ?`;
    const curReplacements = [rangeStart, rangeEnd, cutoffTime];

    if (filters) {
      rangeFilter = appendUtmWhere(rangeFilter, curReplacements, filters);
    }

    const prevReplacements = prevWin ? [prevWin.prevStart, prevWin.prevEnd, cutoffTime] : [];
    if (prevWin && filters) {
      appendUtmWhere("", prevReplacements, filters);
    }

    const salesSql = `SELECT COALESCE(SUM(total_price),0) AS total FROM shopify_orders WHERE ${rangeFilter}`;
    const currentPromise = conn.query(salesSql, { type: QueryTypes.SELECT, replacements: curReplacements });
    const previousPromise = prevWin ? conn.query(salesSql, { type: QueryTypes.SELECT, replacements: prevReplacements }) : Promise.resolve([{ total: 0 }]);
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

async function calcTotalSessionsDelta({ start, end, align, compare, conn, filters }) {
  const date = end || start;
  if (!date && !(start && end)) return { metric: 'TOTAL_SESSIONS_DELTA', date: null, current: null, previous: null, diff_pct: 0, direction: 'flat' };

  if (hasUtmFilters(filters)) {
    const rangeStart = start || date;
    const rangeEnd = end || date;
    const curr = await computeTotalSessions({ start: rangeStart, end: rangeEnd, conn, filters });
    const prevWin = previousWindow(rangeStart, rangeEnd);
    const prev = await computeTotalSessions({ start: prevWin.prevStart, end: prevWin.prevEnd, conn, filters });
    const diff = curr - prev;
    const diff_pct = prev > 0 ? (diff / prev) * 100 : (curr > 0 ? 100 : 0);
    const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
    return { metric: 'TOTAL_SESSIONS_DELTA', range: { start: rangeStart, end: rangeEnd }, current: curr, previous: prev, diff_pct, direction };
  }

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

      // If device_type filter is active, use device-specific columns
      if (filters?.device_type) {
        const curr = await computeSessionsFromDeviceColumns({ start, end, conn, filters, metric: 'sessions' });
        const prev = await computeSessionsFromDeviceColumns({ start: prevWin.prevStart, end: prevWin.prevEnd, conn, filters, metric: 'sessions' });
        const diff = curr - prev;
        const diff_pct = prev > 0 ? (diff / prev) * 100 : (curr > 0 ? 100 : 0);
        const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
        return { metric: 'TOTAL_SESSIONS_DELTA', range: { start, end }, current: curr, previous: prev, diff_pct, direction, align: 'hour', hour: targetHour };
      }

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

async function calcAtcSessionsDelta({ start, end, align, compare, conn, filters }) {
  const date = end || start;
  if (!date && !(start && end)) return { metric: 'ATC_SESSIONS_DELTA', date: null, current: null, previous: null, diff_pct: 0, direction: 'flat' };

  if (hasUtmFilters(filters)) {
    const rangeStart = start || date;
    const rangeEnd = end || date;
    const curr = await computeAtcSessions({ start: rangeStart, end: rangeEnd, conn, filters });
    const prevWin = previousWindow(rangeStart, rangeEnd);
    const prev = await computeAtcSessions({ start: prevWin.prevStart, end: prevWin.prevEnd, conn, filters });
    const diff = curr - prev;
    const diff_pct = prev > 0 ? (diff / prev) * 100 : (curr > 0 ? 100 : 0);
    const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
    return { metric: 'ATC_SESSIONS_DELTA', range: { start: rangeStart, end: rangeEnd }, current: curr, previous: prev, diff_pct, direction };
  }

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

      // If device_type filter is active, use device-specific columns
      if (filters?.device_type) {
        const curr = await computeSessionsFromDeviceColumns({ start, end, conn, filters, metric: 'atc' });
        const prev = await computeSessionsFromDeviceColumns({ start: prevWin.prevStart, end: prevWin.prevEnd, conn, filters, metric: 'atc' });
        const diff = curr - prev;
        const diff_pct = prev > 0 ? (diff / prev) * 100 : (curr > 0 ? 100 : 0);
        const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
        return { metric: 'ATC_SESSIONS_DELTA', range: { start, end }, current: curr, previous: prev, diff_pct, direction, align: 'hour', hour: targetHour };
      }

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

async function calcAovDelta({ start, end, align, compare, conn, debug, filters }) {
  const date = end || start;
  logger.debug(`[AOV DELTA] calcAovDelta called with range ${start} to ${end}`);
  if (!date && !(start && end)) return { metric: 'AOV_DELTA', date: null, current: null, previous: null, diff_pct: 0, direction: 'flat' };

  if ((compare || '').toString().toLowerCase() === 'prev-range-avg' && start && end) {
    const curr = await aovForRange({ start, end, conn, filters });
    const prevWin = previousWindow(start, end);
    const prev = await aovForRange({ start: prevWin.prevStart, end: prevWin.prevEnd, conn, filters });
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
    const salesSqlRange = `SELECT COALESCE(SUM(total_price),0) AS total FROM shopify_orders WHERE created_date >= ? AND created_date <= ? AND created_time < ?`;
    const salesSql = `SELECT COALESCE(SUM(total_price),0) AS total FROM shopify_orders WHERE created_date >= ? AND created_date <= ? AND created_time < ?`;
    const ordersSqlRange = `SELECT COUNT(DISTINCT order_name) AS cnt FROM shopify_orders WHERE created_date >= ? AND created_date <= ? AND created_time < ?`;
    const ordersSql = `SELECT COUNT(DISTINCT order_name) AS cnt FROM shopify_orders WHERE created_date >= ? AND created_date <= ? AND created_time < ?`;

    if (start && end) {
      const targetHour = resolveTargetHour(end);
      const effectiveSeconds = Math.min(fullDaySeconds, Math.max(0, resolveSeconds(end)));
      const cutoffTime = effectiveSeconds >= fullDaySeconds ? '24:00:00' : secondsToTime(effectiveSeconds);
      const prevWin = previousWindow(start, end);

      let whereExtra = "";
      const curReplacements = [start, end, cutoffTime];
      if (filters) {
        whereExtra = appendUtmWhere(whereExtra, curReplacements, filters);
      }
      const prevReplacements = [prevWin.prevStart, prevWin.prevEnd, cutoffTime];
      if (filters) {
        appendUtmWhere("", prevReplacements, filters);
      }

      const salesSqlWithFilter = `SELECT COALESCE(SUM(total_price),0) AS total FROM shopify_orders WHERE created_date >= ? AND created_date <= ? AND created_time < ?` + whereExtra;
      const ordersSqlWithFilter = `SELECT COUNT(DISTINCT order_name) AS cnt FROM shopify_orders WHERE created_date >= ? AND created_date <= ? AND created_time < ?` + whereExtra;

      const [salesCurRows, salesPrevRows, ordersCurRows, ordersPrevRows] = await Promise.all([
        conn.query(salesSqlWithFilter, { type: QueryTypes.SELECT, replacements: curReplacements }),
        conn.query(salesSqlWithFilter, { type: QueryTypes.SELECT, replacements: prevReplacements }),
        conn.query(ordersSqlWithFilter, { type: QueryTypes.SELECT, replacements: curReplacements }),
        conn.query(ordersSqlWithFilter, { type: QueryTypes.SELECT, replacements: prevReplacements })
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

    let whereExtra = "";
    const curReplacements = [date, date, cutoffTime];
    if (filters) {
      whereExtra = appendUtmWhere(whereExtra, curReplacements, filters);
    }
    const prevReplacements = [prev, prev, cutoffTime];
    if (filters) {
      appendUtmWhere("", prevReplacements, filters);
    }

    const salesSqlWithFilter = `SELECT COALESCE(SUM(total_price),0) AS total FROM shopify_orders WHERE created_date >= ? AND created_date <= ? AND created_time < ?` + whereExtra;
    const ordersSqlWithFilter = `SELECT COUNT(DISTINCT order_name) AS cnt FROM shopify_orders WHERE created_date >= ? AND created_date <= ? AND created_time < ?` + whereExtra;

    const [salesCurRows, salesPrevRows, ordersCurRows, ordersPrevRows] = await Promise.all([
      conn.query(salesSqlWithFilter, { type: QueryTypes.SELECT, replacements: curReplacements }),
      conn.query(salesSqlWithFilter, { type: QueryTypes.SELECT, replacements: prevReplacements }),
      conn.query(ordersSqlWithFilter, { type: QueryTypes.SELECT, replacements: curReplacements }),
      conn.query(ordersSqlWithFilter, { type: QueryTypes.SELECT, replacements: prevReplacements }),
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

async function calcCvrDelta({ start, end, align, compare, conn, filters }) {
  const target = end || start;
  if (!target && !(start && end)) {
    return { metric: 'CVR_DELTA', date: null, current: null, previous: null, diff_pp: 0, diff_pct: 0, direction: 'flat' };
  }

  const alignLower = (align || '').toString().toLowerCase();
  const compareLower = (compare || '').toString().toLowerCase();

  // Fix: If filters are present, the hourly_sessions_summary_shopify table cannot be used (it lacks UTMs).
  // Fallback to day-level calculation using the snapshot table, which supports filters.
  if (hasUtmFilters(filters)) {
    let curr, prev;
    if (start && end) {
      curr = await cvrForRange({ start, end, conn, filters });
      const prevWin = previousWindow(start, end);
      prev = await cvrForRange({ start: prevWin.prevStart, end: prevWin.prevEnd, conn, filters });
      const delta = computePercentDelta(curr.cvr_percent || 0, prev.cvr_percent || 0);
      // Handle 0 sessions
      if (curr.total_sessions === 0) {
        return { metric: 'CVR_DELTA', range: { start, end }, current: curr, previous: prev, diff_pp: 0, diff_pct: 0, direction: 'flat' };
      }
      return { metric: 'CVR_DELTA', range: { start, end }, current: curr, previous: prev, diff_pp: delta.diff_pp, diff_pct: delta.diff_pct, direction: delta.direction };
    } else {
      // Single day
      const prevStr = prevDayStr(target);
      [curr, prev] = await Promise.all([
        computeCVRForDay(target, conn, filters),
        computeCVRForDay(prevStr, conn, filters)
      ]);
      if (curr.total_sessions === 0) {
        return { metric: 'CVR_DELTA', date: target, current: curr, previous: prev, diff_pp: 0, diff_pct: 0, direction: 'flat' };
      }
      const delta = computePercentDelta(curr.cvr_percent || 0, prev.cvr_percent || 0);
      return { metric: 'CVR_DELTA', date: target, current: curr, previous: prev, diff_pp: delta.diff_pp, diff_pct: delta.diff_pct, direction: delta.direction };
    }
  }

  if (compareLower === 'prev-range-avg' && start && end) {
    const curr = await cvrForRange({ start, end, conn, filters });

    // Fix: If current sessions are 0, force CVR delta to 0/flat to avoid misleading percentages.
    if (curr.total_sessions === 0) {
      return {
        metric: 'CVR_DELTA',
        range: { start, end },
        current: curr,
        previous: { cvr_percent: 0 },
        diff_pp: 0,
        diff_pct: 0,
        direction: 'flat',
        compare: 'prev-range-avg'
      };
    }

    const prevWin = previousWindow(start, end);
    const prev = await cvrForRange({ start: prevWin.prevStart, end: prevWin.prevEnd, conn, filters });
    const delta = computePercentDelta(curr.cvr_percent || 0, prev.cvr_percent || 0);
    return { metric: 'CVR_DELTA', range: { start, end }, current: curr, previous: prev, diff_pp: delta.diff_pp, diff_pct: delta.diff_pct, direction: delta.direction, compare: 'prev-range-avg' };
  }

  const base = new Date(`${target}T00:00:00Z`);
  const prev = new Date(base.getTime() - 24 * 3600_000);
  const prevStr = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}-${String(prev.getUTCDate()).padStart(2, '0')}`;

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
    computeCVRForDay(target, conn, filters),
    computeCVRForDay(prevStr, conn, filters)
  ]);

  if (current.total_sessions === 0) {
    return { metric: 'CVR_DELTA', date: target, current, previous, diff_pp: 0, diff_pct: 0, direction: 'flat' };
  }

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
        logger.debug(`[MEM CACHE] Reuse pending request for ${brandKey} on ${date}`);
        return entry.promise;
      }
      logger.debug(`[MEM CACHE] Hit for ${brandKey} on ${date}`);
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
          logger.debug(`[REDIS HIT] ${key}`);
        } else {
          logger.debug(`[REDIS MISS] ${key}`);
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
        logger.debug(`[MEM CACHE] Hit for ${key}`);
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
      logger.debug(`[REDIS MGET] Fetching ${missingKeys.length} keys`);
      const rawValues = await redisClient.mget(missingKeys);

      rawValues.forEach((raw, i) => {
        const originalIdx = missingIndices[i];
        const key = missingKeys[i];

        if (raw) {
          const data = JSON.parse(raw);
          MEM_CACHE.set(key, { timestamp: now, data, promise: null });
          results[originalIdx] = data;
          logger.debug(`[REDIS HIT] ${key}`);
        } else {
          logger.debug(`[REDIS MISS] ${key}`);
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
            logger.debug(`[CACHE USE] AOV for ${req.brandKey} on ${start} | Value: ${cached.average_order_value}`);
            return res.json({
              metric: "AOV",
              range: { start, end },
              total_sales: cached.total_sales,
              total_orders: cached.total_orders,
              aov: cached.average_order_value
            });
          }
        }

        const result = await computeAOV({
          start, end, conn: req.brandDb.sequelize, filters: extractFilters(req)
        });
        logger.debug(`[DB FETCH] AOV for ${req.brandKey} on range ${start} to ${end} | Result: ${JSON.stringify({ total_sales: result.total_sales, total_orders: result.total_orders, aov: result.aov })}`);
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
            logger.debug(`[CACHE USE] CVR for ${req.brandKey} on ${start} | Value: ${cached.conversion_rate}`);
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

        const result = await computeCVR({
          start, end, conn: req.brandDb.sequelize, filters: extractFilters(req)
        });
        logger.debug(`[DB FETCH] CVR for ${req.brandKey} on range ${start} to ${end} | Result: ${JSON.stringify({ total_orders: result.total_orders, total_sessions: result.total_sessions, cvr: result.cvr })}`);
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
        const result = await calcCvrDelta({
          start, end, align, compare, conn: req.brandDb.sequelize, filters: extractFilters(req)
        });
        return res.json(result);
      } catch (err) { console.error(err); return res.status(500).json({ error: "Internal server error" }); }
    },

    totalOrdersDelta: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
        if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
        const { start, end } = parsed.data;
        const align = (req.query.align || '').toString().toLowerCase();
        const compare = (req.query.compare || '').toString().toLowerCase();

        const result = await calcTotalOrdersDelta({
          start, end, align, compare, conn: req.brandDb.sequelize, filters: extractFilters(req)
        });
        return res.json(result);
      } catch (err) { console.error(err); return res.status(500).json({ error: "Internal server error" }); }
    },



    totalSalesDelta: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
        if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
        const { start, end } = parsed.data;
        const date = end || start || null;
        const align = (req.query.align || '').toString().toLowerCase();
        // Total Sales Delta Handler
        const filters = extractFilters(req);
        if (align === 'hour') {
          return res.json(await computeMetricDelta({
            metricName: 'TOTAL_SALES_DELTA',
            range: { start: start || date, end: end || date },
            conn: req.brandDb.sequelize,
            queryFn: async ({ rangeStart, rangeEnd, prevStart, prevEnd, cutoffTime, prevCutoffTime }) => {
              let sqlRange = `SELECT COALESCE(SUM(total_price),0) AS total FROM shopify_orders WHERE created_dt >= ? AND created_dt <= ? AND created_time < ?`;
              const curReplacements = [rangeStart, rangeEnd, cutoffTime];
              if (filters) {
                sqlRange = appendUtmWhere(sqlRange, curReplacements, filters);
              }
              const prevReplacements = [prevStart, prevEnd, prevCutoffTime];
              if (filters) {
                appendUtmWhere("", prevReplacements, filters);
              }
              const [currRows, prevRows] = await Promise.all([
                req.brandDb.sequelize.query(sqlRange, { type: QueryTypes.SELECT, replacements: curReplacements }),
                req.brandDb.sequelize.query(sqlRange, { type: QueryTypes.SELECT, replacements: prevReplacements }),
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
        }
        if (!conn) return res.status(500).json({ error: 'Brand DB connection unavailable' });

        let end = (req.query.end || '').toString().trim() || null;
        if (end) {
          const parsed = isoDate.safeParse(end);
          if (!parsed.success) return res.status(400).json({ error: 'Invalid end date. Use YYYY-MM-DD' });
        } else {
          const rows = await conn.query('SELECT MAX(date) AS max_d FROM overall_summary', { type: QueryTypes.SELECT });
          const maxd = Array.isArray(rows) ? rows[0]?.max_d : (rows && rows.max_d);
          end = maxd || new Date().toISOString().slice(0, 10);
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
        const date = end || start || null;
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
        const date = end || start || null;
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
        const date = end || start || null;
        const align = (req.query.align || '').toString().toLowerCase();
        // AOV Delta logic
        const filters = extractFilters(req);
        if (align === 'hour') {
          return res.json(await computeMetricDelta({
            metricName: 'AOV_DELTA',
            range: { start: start || date, end: end || date },
            conn: req.brandDb.sequelize,
            queryFn: async ({ rangeStart, rangeEnd, prevStart, prevEnd, cutoffTime, prevCutoffTime }) => {
              let salesSqlRange = `SELECT COALESCE(SUM(total_price),0) AS total FROM shopify_orders WHERE created_dt >= ? AND created_dt <= ? AND created_time < ?`;
              let ordersSqlRange = `SELECT COUNT(DISTINCT order_name) AS cnt FROM shopify_orders WHERE created_dt >= ? AND created_dt <= ? AND created_time < ?`;

              const curReplacements = [rangeStart, rangeEnd, cutoffTime];
              const prevReplacements = [prevStart, prevEnd, prevCutoffTime];

              if (filters) {
                salesSqlRange = appendUtmWhere(salesSqlRange, curReplacements, filters);
                ordersSqlRange = appendUtmWhere(ordersSqlRange, curReplacements, filters);

                // For prev, we use a new call or just append dummy? 
                // Using dummy empty append to push params to prevReplacements list
                appendUtmWhere("", prevReplacements, filters);
              }

              const [salesCurRows, salesPrevRows, ordersCurRows, ordersPrevRows] = await Promise.all([
                req.brandDb.sequelize.query(salesSqlRange, { type: QueryTypes.SELECT, replacements: curReplacements }),
                req.brandDb.sequelize.query(salesSqlRange, { type: QueryTypes.SELECT, replacements: prevReplacements }),
                req.brandDb.sequelize.query(ordersSqlRange, { type: QueryTypes.SELECT, replacements: curReplacements }),
                req.brandDb.sequelize.query(ordersSqlRange, { type: QueryTypes.SELECT, replacements: prevReplacements }),
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

    trafficSourceSplit: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
        if (!parsed.success) return res.status(400).json({ error: "Invalid date range" });
        const { start, end } = parsed.data;
        const conn = req.brandDb.sequelize;

        console.log(`[TrafficSplit] Request for ${start} to ${end}`);

        // Calculate previous directory
        const startDate = new Date(start);
        const endDate = new Date(end);
        const diffTime = Math.abs(endDate - startDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive days

        const prevEnd = new Date(startDate);
        prevEnd.setDate(prevEnd.getDate() - 1);
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevStart.getDate() - diffDays + 1);

        const formatDate = (d) => d.toISOString().split('T')[0];
        const pStart = formatDate(prevStart);
        const pEnd = formatDate(prevEnd);

        console.log(`[TrafficSplit] Current: ${start} to ${end}, Previous: ${pStart} to ${pEnd}`);

        const sql = `
          SELECT 
            utm_source, 
            utm_source_sessions as sessions, 
            utm_source_atc_sessions as atc_sessions,
            utm_names,
            date
          FROM overall_utm_summary
          WHERE (date >= ? AND date <= ?) OR (date >= ? AND date <= ?)
        `;

        const rows = await conn.query(sql, {
          type: QueryTypes.SELECT,
          replacements: [start, end, pStart, pEnd]
        });
        console.log(`[TrafficSplit] Rows found: ${rows.length}`);

        // Normalize and aggregate
        const initStats = () => ({ sessions: 0, atc_sessions: 0 });

        let current = {
          meta: initStats(), google: initStats(), direct: initStats(), others: initStats()
        };
        let previous = {
          meta: initStats(), google: initStats(), direct: initStats(), others: initStats()
        };

        // Detailed breakdown for Others (Current Period Only)
        const othersMap = new Map(); // name -> { sessions, atc }
        const metaMap = new Map();

        rows.forEach((r, idx) => {
          let rowDate = r.date;
          if (rowDate instanceof Date) {
            // Add 12 hours to safely cross timezone boundaries (e.g. 18:30 prev day -> 06:30 current day)
            const adjustedDate = new Date(rowDate.getTime() + 12 * 60 * 60 * 1000);
            rowDate = adjustedDate.toISOString().split('T')[0];
          }

          const isCurrent = rowDate >= start && rowDate <= end;
          const targetBucket = isCurrent ? current : previous;

          const source = (r.utm_source || '').toLowerCase().trim();
          const sess = Number(r.sessions || 0);
          const atc = Number(r.atc_sessions || 0);

          let category = 'others';
          let isOthers = false;
          let isMeta = false;

          if (source === 'meta' || source.includes('facebook') || source.includes('instagram')) {
            category = 'meta';
            isMeta = true;
          } else if (source === 'google' || source.includes('google')) {
            category = 'google';
          } else if (source === 'direct' || source === '(direct)' || source === '(none)') {
            category = 'direct';
          } else {
            isOthers = true;
          }

          targetBucket[category].sessions += sess;
          targetBucket[category].atc_sessions += atc;

          // Process breakdown ONLY for current period
          if (isCurrent && (isOthers || isMeta) && r.utm_names) {
            try {
              const details = typeof r.utm_names === 'string' ? JSON.parse(r.utm_names) : r.utm_names;
              if (Array.isArray(details)) {
                details.forEach(d => {
                  const name = (d.utm_name || 'Unknown').trim();
                  const dSess = Number(d.sessions || 0);
                  const dAtc = Number(d.atc_sessions || 0);

                  const targetMap = isOthers ? othersMap : metaMap;

                  if (!targetMap.has(name)) {
                    targetMap.set(name, { sessions: 0, atc: 0 });
                  }
                  const entry = targetMap.get(name);
                  entry.sessions += dSess;
                  entry.atc += dAtc;
                });
              }
            } catch (err) {
              // ignore parse error
            }
          }
        });

        // Convert Map to sorted array
        const othersBreakdown = Array.from(othersMap.entries())
          .map(([name, stats]) => ({ name, sessions: stats.sessions, atc_sessions: stats.atc }))
          .sort((a, b) => b.sessions - a.sessions)
          .slice(0, 15); // Top 15

        const metaBreakdown = Array.from(metaMap.entries())
          .map(([name, stats]) => ({ name, sessions: stats.sessions, atc_sessions: stats.atc }))
          .sort((a, b) => b.sessions - a.sessions)
          .slice(0, 15); // Top 15

        // Calculate Deltas
        const calcDelta = (curr, prev) => {
          if (prev === 0) return curr > 0 ? 100 : 0; // If prev is 0 and curr > 0, treat as 100% growth (or just 100 to show positive)
          return ((curr - prev) / prev) * 100;
        };

        console.log(`[TrafficSplit] Meta ATCs (Curr/Prev): ${current.meta.atc_sessions} / ${previous.meta.atc_sessions}`);
        const addDelta = (cat) => ({
          ...current[cat],
          delta: calcDelta(current[cat].sessions, previous[cat].sessions),
          atc_delta: calcDelta(current[cat].atc_sessions, previous[cat].atc_sessions)
        });

        const meta = addDelta('meta');
        const google = addDelta('google');
        const direct = addDelta('direct');
        const others = addDelta('others');

        const total_sessions = meta.sessions + google.sessions + direct.sessions + others.sessions;
        const total_atc = meta.atc_sessions + google.atc_sessions + direct.atc_sessions + others.atc_sessions;

        res.json({
          meta,
          google,
          direct,
          others,
          others_breakdown: othersBreakdown,
          meta_breakdown: metaBreakdown,
          total_sessions,
          total_atc_sessions: total_atc,
          prev_range: { start: pStart, end: pEnd }
        });

      } catch (e) {
        console.error('Traffic Source Split error', e);
        // Fallback to empty if table doesn't exist or other error
        res.json({
          meta: { sessions: 0, atc_sessions: 0 },
          google: { sessions: 0, atc_sessions: 0 },
          direct: { sessions: 0, atc_sessions: 0 },
          others: { sessions: 0, atc_sessions: 0 },
          total_sessions: 0,
          total_atc_sessions: 0,
          error: true
        });
      }
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


        const total_sales = await computeTotalSales({
          start, end, conn: req.brandDb.sequelize, filters: extractFilters(req)
        });
        if (start && end && start === end) {
          const cached = await fetchCachedMetrics(req.brandKey, start);
          if (cached) {
            logger.debug(`[CACHE USE] TOTAL_SALES for ${req.brandKey} on ${start} | Value: ${cached.total_sales}`);
            return res.json({ metric: "TOTAL_SALES", range: { start: start || null, end: end || null }, total_sales: cached.total_sales });
          }
        }
        logger.debug(`[DB FETCH] TOTAL_SALES for ${req.brandKey} on range ${start} to ${end} | Result: ${total_sales}`);
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

        const total_orders = await computeTotalOrders({
          start, end, conn: req.brandDb.sequelize, filters: extractFilters(req)
        });
        if (start && end && start === end) {
          const cached = await fetchCachedMetrics(req.brandKey, start);
          if (cached) {
            logger.debug(`[CACHE USE] TOTAL_ORDERS for ${req.brandKey} on ${start} | Value: ${cached.total_orders}`);
            return res.json({ metric: "TOTAL_ORDERS", range: { start: start || null, end: end || null }, total_orders: cached.total_orders });
          }
        }
        logger.debug(`[DB FETCH] TOTAL_ORDERS for ${req.brandKey} on range ${start} to ${end} | Result: ${total_orders}`);
        return res.json({ metric: "TOTAL_ORDERS", range: { start: start || null, end: end || null }, total_orders });
      } catch (err) { console.error(err); return res.status(500).json({ error: "Internal server error" }); }
    },

    funnelStats: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
        if (!parsed.success) return res.status(400).json({ error: "Invalid date range", details: parsed.error.flatten() });
        const { start, end } = parsed.data;
        const productIdRaw = (req.query.product_id || '').toString().trim();

        const filters = extractFilters(req);

        if (!productIdRaw) {
          const stats = await computeFunnelStats({ start, end, conn: req.brandDb.sequelize, filters });
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
        const filters = extractFilters(req);
        const hasUtm = !!(filters.utm_source || filters.utm_medium || filters.utm_campaign || filters.sales_channel);

        if (productIdRaw || hasUtm) {
          if (!start && !end) {
            return res.json({ metric: "ORDER_SPLIT", range: { start: null, end: null, product_id: productIdRaw }, cod_orders: 0, prepaid_orders: 0, partially_paid_orders: 0, total_orders_from_split: 0, cod_percent: 0, prepaid_percent: 0, partially_paid_percent: 0 });
          }
          const effectiveStart = start || end;
          const effectiveEnd = end || start;
          const startTs = `${effectiveStart} 00:00:00`;
          const endTsExclusive = new Date(`${effectiveEnd}T00:00:00Z`);
          endTsExclusive.setUTCDate(endTsExclusive.getUTCDate() + 1);
          const endTs = endTsExclusive.toISOString().slice(0, 19).replace('T', ' ');

          let whereSql = `WHERE created_at >= ? AND created_at < ?`;
          let replacements = [startTs, endTs];
          if (productIdRaw) {
            whereSql += ` AND product_id = ?`;
            replacements.push(productIdRaw);
          }
          whereSql = appendUtmWhere(whereSql, replacements, filters);

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
              ${whereSql}
              GROUP BY payment_gateway_names, order_name
            ) sub
            GROUP BY payment_type`;

          const rows = await req.brandDb.sequelize.query(sql, { type: QueryTypes.SELECT, replacements });

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
          return res.json({ metric: "ORDER_SPLIT", range: { start: effectiveStart, end: effectiveEnd, product_id: productIdRaw, ...filters }, cod_orders, prepaid_orders, partially_paid_orders, total_orders_from_split: total, cod_percent, prepaid_percent, partially_paid_percent, sql_used: process.env.NODE_ENV === 'production' ? undefined : sql });
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
        const filters = extractFilters(req);

        let whereSql = `WHERE created_at >= ? AND created_at < ?`;
        let replacements = []; // will be set below
        if (productIdRaw) whereSql += ` AND product_id = ?`;
        whereSql = appendUtmWhere(whereSql, [], filters);

        if (!start && !end) {
          return res.json({ metric: 'PAYMENT_SPLIT_SALES', range: { start: null, end: null }, cod_sales: 0, prepaid_sales: 0, partial_sales: 0, total_sales_from_split: 0, cod_percent: 0, prepaid_percent: 0, partial_percent: 0 });
        }
        const effectiveStart = start || end;
        const effectiveEnd = end || start;
        const startTs = `${effectiveStart} 00:00:00`;
        const endTsExclusive = new Date(`${effectiveEnd}T00:00:00Z`);
        endTsExclusive.setUTCDate(endTsExclusive.getUTCDate() + 1);
        const endTs = endTsExclusive.toISOString().slice(0, 19).replace('T', ' ');

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
        ${whereSql}
        GROUP BY payment_gateway_names, order_name
      ) sub
      GROUP BY payment_type`;

        let rows = [];
        try {
          replacements = [startTs, endTs];
          if (productIdRaw) replacements.push(productIdRaw);
          appendUtmWhere("", replacements, filters);

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

        const filters = extractFilters(req);

        const conn = req.brandDb.sequelize;

        // Sessions Query (Product Level, likely no channel breakdown in MV)
        let sessionsSql = `
          SELECT
            SUM(sessions) AS total_sessions,
            SUM(sessions_with_cart_additions) AS total_atc_sessions
          FROM mv_product_sessions_by_path_daily
          WHERE date >= ? AND date <= ?
        `;
        const sessionReplacements = [rangeStart, rangeEnd];

        if (filters.product_id) {
          if (Array.isArray(filters.product_id)) {
            sessionsSql += ` AND product_id IN (?)`;
            sessionReplacements.push(filters.product_id);
          } else {
            sessionsSql += ` AND product_id = ?`;
            sessionReplacements.push(filters.product_id);
          }
        }
        // NOTE: If MV supports channel/UTM, add here. Assuming it doesn't for now.

        // Orders/Sales Query (Supports all filters)
        let ordersSql = `
          SELECT
            COUNT(DISTINCT order_name) AS total_orders,
            COALESCE(SUM((line_item_price - COALESCE(discount_amount_per_line_item, 0)) * line_item_quantity), 0) AS total_sales
          FROM shopify_orders
          WHERE created_date >= ? AND created_date <= ?
        `;
        const orderReplacements = [rangeStart, rangeEnd];

        ordersSql = appendUtmWhere(ordersSql, orderReplacements, filters);

        if (filters.product_id) {
          if (Array.isArray(filters.product_id)) {
            ordersSql += ` AND product_id IN (?)`;
            orderReplacements.push(filters.product_id);
          } else {
            ordersSql += ` AND product_id = ?`;
            orderReplacements.push(filters.product_id);
          }
        }

        const [[sessRow], [orderRow]] = await Promise.all([
          conn.query(sessionsSql, { type: QueryTypes.SELECT, replacements: sessionReplacements }),
          conn.query(ordersSql, { type: QueryTypes.SELECT, replacements: orderReplacements }),
        ]);

        const totalSessions = Number(sessRow?.total_sessions || 0);
        const totalAtcSessions = Number(sessRow?.total_atc_sessions || 0);
        const totalOrders = Number(orderRow?.total_orders || 0);
        const totalSales = Number(orderRow?.total_sales || 0);

        const addToCartRate = totalSessions > 0 ? totalAtcSessions / totalSessions : 0;
        const cvr = totalSessions > 0 ? totalOrders / totalSessions : 0;

        return res.json({

          product_id: filters.product_id,
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

        const filters = extractFilters(req);
        const hasFilters = !!(filters.utm_source || filters.utm_medium || filters.utm_campaign || filters.product_id || filters.sales_channel || filters.device_type);

        let querySql = `SELECT DATE_FORMAT(date, '%Y-%m-%d') AS date, hour, total_sales, number_of_orders,
        COALESCE(adjusted_number_of_sessions, number_of_sessions) AS number_of_sessions,
        adjusted_number_of_sessions,
        number_of_sessions AS raw_number_of_sessions,
        number_of_atc_sessions
       FROM hour_wise_sales
       WHERE date >= ? AND date <= ?`;
        let queryReplacements = [start, end];

        if (hasFilters) {
          const salesExpr = filters.product_id
            ? `COALESCE(SUM((line_item_price - COALESCE(discount_amount_per_line_item, 0)) * line_item_quantity), 0)`
            : `SUM(total_price)`;

          querySql = `SELECT created_date AS date, HOUR(created_time) AS hour, 
                        ${salesExpr} AS total_sales, 
                        COUNT(DISTINCT order_name) AS number_of_orders,
                        0 AS number_of_sessions,
                        0 AS adjusted_number_of_sessions,
                        0 AS raw_number_of_sessions,
                        0 AS number_of_atc_sessions
                 FROM shopify_orders 
                 WHERE created_date >= ? AND created_date <= ?`;
          querySql = appendUtmWhere(querySql, queryReplacements, filters);

          if (filters.product_id) {
            if (Array.isArray(filters.product_id)) {
              querySql += ` AND product_id IN (?)`;
              queryReplacements.push(filters.product_id);
            } else {
              querySql += ` AND product_id = ?`;
              queryReplacements.push(filters.product_id);
            }
          }
          querySql += ` GROUP BY date, hour`;
        }

        const rows = await req.brandDb.sequelize.query(querySql, { type: QueryTypes.SELECT, replacements: queryReplacements });

        // NEW: Fetch Product Sessions if filtered by product
        let productSessionsMap = new Map(); // date -> count
        if (filters.product_id) {
          try {
            let sessionSql = `SELECT date, SUM(sessions) as sessions FROM mv_product_sessions_by_path_daily WHERE date >= ? AND date <= ?`;
            const sessionReplacements = [start, end];

            if (Array.isArray(filters.product_id)) {
              sessionSql += ` AND product_id IN (?)`;
              sessionReplacements.push(filters.product_id);
            } else {
              sessionSql += ` AND product_id = ?`;
              sessionReplacements.push(filters.product_id);
            }
            sessionSql += ` GROUP BY date`;

            const sessionRows = await req.brandDb.sequelize.query(sessionSql, { type: QueryTypes.SELECT, replacements: sessionReplacements });
            sessionRows.forEach(r => {
              productSessionsMap.set(String(r.date), Number(r.sessions || 0));
            });
          } catch (err) {
            console.warn('[hourlyTrend] Failed to fetch product sessions', err);
          }
        }

        const rowMap = new Map();

        // Helper to distribute daily sessions over hours
        const distributeSessions = (dateStr, totalSessions) => {
          // Distribute evenly over 24 hours for now (simple estimation)
          // Or we could distribute only over active hours if we had that data.
          const perHour = totalSessions / 24;
          for (let h = 0; h < 24; h++) {
            const key = `${dateStr}#${h}`;
            const existing = rowMap.get(key) || { sales: 0, sessions: 0, adjusted_sessions: 0, raw_sessions: 0, orders: 0, atc: 0 };
            existing.sessions += perHour;
            existing.adjusted_sessions += perHour;
            existing.raw_sessions += perHour;
            rowMap.set(key, existing);
          }
        };

        // Populate rowMap with Sales/Orders from main query
        for (const row of rows) {
          if (!row?.date) continue;
          const dateStr = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date);
          const hourVal = typeof row.hour === 'number' ? row.hour : Number(row.hour);
          if (!Number.isFinite(hourVal) || hourVal < 0 || hourVal > 23) continue;
          const key = `${dateStr}#${hourVal}`;

          const existing = rowMap.get(key) || { sales: 0, sessions: 0, adjusted_sessions: 0, raw_sessions: 0, orders: 0, atc: 0 };
          existing.sales += Number(row.total_sales || 0);
          existing.orders += Number(row.number_of_orders || 0);
          existing.atc += Number(row.number_of_atc_sessions || 0);

          if (!filters.product_id) {
            // If NOT filtering by product, use the sessions from the main query (hour_wise_sales)
            existing.sessions += Number(row.raw_number_of_sessions || 0);
            existing.adjusted_sessions += Number(row.adjusted_number_of_sessions || 0);
            existing.raw_sessions += Number(row.raw_number_of_sessions || 0);
          }
          rowMap.set(key, existing);
        }

        // If filtering by product, distribute the fetched daily sessions
        if (filters.product_id) {
          for (const [dateStr, count] of productSessionsMap.entries()) {
            distributeSessions(dateStr, count);
          }
        }

        // NEW: Fetch device-type specific sessions from hourly_sessions_summary_shopify
        if (filters.device_type && !filters.product_id) {
          try {
            const types = Array.isArray(filters.device_type) ? filters.device_type : [filters.device_type];
            const sessCols = [];
            const atcCols = [];
            for (const t of types) {
              const lower = (t || '').toString().toLowerCase().trim();
              if (lower === 'desktop') {
                sessCols.push('desktop_sessions');
                atcCols.push('desktop_atc_sessions');
              } else if (lower === 'mobile') {
                sessCols.push('mobile_sessions', 'tablet_sessions');
                atcCols.push('mobile_atc_sessions', 'tablet_atc_sessions');
              } else if (lower === 'others') {
                sessCols.push('other_sessions');
                atcCols.push('other_atc_sessions');
              }
            }
            if (sessCols.length > 0) {
              const sessExpr = sessCols.map(c => `COALESCE(${c}, 0)`).join(' + ');
              const atcExpr = atcCols.map(c => `COALESCE(${c}, 0)`).join(' + ');
              const deviceSessionSql = `SELECT DATE_FORMAT(date, '%Y-%m-%d') AS date, hour,
                (${sessExpr}) AS device_sessions,
                (${atcExpr}) AS device_atc_sessions
                FROM hourly_sessions_summary_shopify
                WHERE date >= ? AND date <= ?
                GROUP BY date, hour`;
              const deviceRows = await req.brandDb.sequelize.query(deviceSessionSql, {
                type: QueryTypes.SELECT, replacements: [start, end]
              });
              for (const dr of deviceRows) {
                if (!dr?.date) continue;
                const dateStr = dr.date instanceof Date ? dr.date.toISOString().slice(0, 10) : String(dr.date);
                const hourVal = typeof dr.hour === 'number' ? dr.hour : Number(dr.hour);
                if (!Number.isFinite(hourVal) || hourVal < 0 || hourVal > 23) continue;
                const key = `${dateStr}#${hourVal}`;
                const existing = rowMap.get(key) || { sales: 0, sessions: 0, adjusted_sessions: 0, raw_sessions: 0, orders: 0, atc: 0 };
                existing.sessions += Number(dr.device_sessions || 0);
                existing.adjusted_sessions += Number(dr.device_sessions || 0);
                existing.raw_sessions += Number(dr.device_sessions || 0);
                existing.atc += Number(dr.device_atc_sessions || 0);
                rowMap.set(key, existing);
              }
            }
          } catch (err) {
            console.warn('[hourlyTrend] Failed to fetch device-type sessions', err);
          }
        }

        const startDate = new Date(`${start}T00:00:00Z`);
        const endDate = new Date(`${end}T00:00:00Z`);
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
          return res.status(400).json({ error: 'Unable to parse date range' });
        }

        const DAY_MS = 24 * 3600_000;
        let points = [];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
          let compSql = `SELECT DATE_FORMAT(date, '%Y-%m-%d') AS date, hour, total_sales, number_of_orders,
    COALESCE(adjusted_number_of_sessions, number_of_sessions) AS number_of_sessions,
    adjusted_number_of_sessions,
    number_of_sessions AS raw_number_of_sessions,
    number_of_atc_sessions
         FROM hour_wise_sales
         WHERE date >= ? AND date <= ?`;
          let compReplacements = [prevWin.prevStart, prevWin.prevEnd];

          if (hasFilters) {
            const salesExpr = filters.product_id
              ? `COALESCE(SUM((line_item_price - COALESCE(discount_amount_per_line_item, 0)) * line_item_quantity), 0)`
              : `SUM(total_price)`;

            compSql = `SELECT created_date AS date, HOUR(created_time) AS hour, 
                         ${salesExpr} AS total_sales, 
                         COUNT(DISTINCT order_name) AS number_of_orders,
                         0 AS number_of_sessions,
                         0 AS adjusted_number_of_sessions,
                         0 AS raw_number_of_sessions,
                         0 AS number_of_atc_sessions
                  FROM shopify_orders 
                  WHERE created_date >= ? AND created_date <= ?`;
            compSql = appendUtmWhere(compSql, compReplacements, filters);
            if (filters.product_id) { compSql += ` AND product_id = ?`; compReplacements.push(filters.product_id); }
            compSql += ` GROUP BY date, hour`;
          }

          const comparisonRows = await req.brandDb.sequelize.query(compSql, { type: QueryTypes.SELECT, replacements: compReplacements });

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
            return { hour, label: `${String(hour).padStart(2, '0')}:00`, metrics: avg };
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
        const filters = extractFilters(req);
        const hasFilters = !!(filters.utm_source || filters.utm_medium || filters.utm_campaign || filters.product_id || filters.sales_channel);

        let sql = `
          SELECT DATE_FORMAT(date, '%Y-%m-%d') AS date, 
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
        let replacements = [start, end];

        if (hasFilters) {
          const salesExpr = filters.product_id
            ? `COALESCE(SUM((line_item_price - COALESCE(discount_amount_per_line_item, 0)) * line_item_quantity), 0)`
            : `SUM(total_price)`;

          sql = `SELECT DATE_FORMAT(created_date, '%Y-%m-%d') AS date, 
                       ${salesExpr} AS sales, 
                       COUNT(DISTINCT order_name) AS orders,
                       0 AS sessions, 
                       0 AS adjusted_sessions, 
                       0 AS raw_sessions, 
                       0 AS atc 
                FROM shopify_orders 
                WHERE created_date >= ? AND created_date <= ?`;
          sql = appendUtmWhere(sql, replacements, filters);

          if (filters.product_id) {
            if (Array.isArray(filters.product_id)) {
              sql += ` AND product_id IN (?)`;
              replacements.push(filters.product_id);
            } else {
              sql += ` AND product_id = ?`;
              replacements.push(filters.product_id);
            }
          }
          sql += ` GROUP BY date ORDER BY date ASC`;
        }

        const rows = await req.brandDb.sequelize.query(sql, { type: QueryTypes.SELECT, replacements: replacements });

        const debugInfo = { brand: req.brandKey, rows: rows.slice(0, 5), overallRows: [] };

        // NEW: Fetch Product Sessions for Daily Trend
        let productSessionsMap = new Map();
        if (filters.product_id) {
          try {
            // Include ATC sessions and format date to match daily buckets
            let sessionSql = `SELECT DATE_FORMAT(date, '%Y-%m-%d') as date, SUM(sessions) as sessions, SUM(sessions_with_cart_additions) as atc FROM mv_product_sessions_by_path_daily WHERE date >= ? AND date <= ?`;
            const sessionReplacements = [start, end];

            if (Array.isArray(filters.product_id)) {
              sessionSql += ` AND product_id IN (?)`;
              sessionReplacements.push(filters.product_id);
            } else {
              sessionSql += ` AND product_id = ?`;
              sessionReplacements.push(filters.product_id);
            }
            sessionSql += ` GROUP BY date`;

            const sessionRows = await req.brandDb.sequelize.query(sessionSql, { type: QueryTypes.SELECT, replacements: sessionReplacements });
            sessionRows.forEach(r => {
              productSessionsMap.set(String(r.date), { sessions: Number(r.sessions || 0), atc: Number(r.atc || 0) });
            });
          } catch (err) {
            console.warn('[dailyTrend] Failed to fetch product sessions', err);
          }
        }

        // NEW: Fetch UTM Sessions for Daily Trend
        let utmSessionsMap = new Map();
        if (hasFilters && !filters.product_id) {
          try {
            let utmSessSql = `SELECT DATE_FORMAT(date, '%Y-%m-%d') as date, SUM(sessions) as sessions, SUM(sessions_with_cart_additions) as atc FROM product_sessions_snapshot WHERE date >= ? AND date <= ?`;
            const utmSessReplacements = [start, end];
            utmSessSql = appendUtmWhere(utmSessSql, utmSessReplacements, { ...filters, sales_channel: null }, true);
            utmSessSql += ` GROUP BY date`;

            const utmSessRows = await req.brandDb.sequelize.query(utmSessSql, { type: QueryTypes.SELECT, replacements: utmSessReplacements });
            utmSessRows.forEach(r => {
              utmSessionsMap.set(String(r.date), { sessions: Number(r.sessions || 0), atc: Number(r.atc || 0) });
            });
          } catch (err) {
            console.warn('[dailyTrend] Failed to fetch UTM sessions', err);
          }
        }

        const map = new Map(rows.map(r => {
          const d = String(r.date);
          let sessions = Number(r.sessions || 0);
          let adjusted = Number(r.adjusted_sessions || 0);
          let raw = Number(r.raw_sessions || 0);

          if (filters.product_id) {
            // Override sessions with data from MV
            const productData = productSessionsMap.get(d) || { sessions: 0, atc: 0 };
            sessions = productData.sessions;
            adjusted = productData.sessions;
            raw = productData.sessions;
          } else if (hasFilters) {
            // Use UTM sessions
            const utmData = utmSessionsMap.get(d) || { sessions: 0, atc: 0 };
            sessions = utmData.sessions;
            adjusted = utmData.sessions;
            raw = utmData.sessions;
          }

          return [d, { sales: Number(r.sales || 0), orders: Number(r.orders || 0), sessions, adjusted_sessions: adjusted, raw_sessions: raw, atc: Number(r.atc || 0) }];
        }));

        let overallMap = new Map();
        if (!hasFilters) {
          const overallRows = await req.brandDb.sequelize.query(
            `SELECT DATE_FORMAT(date, '%Y-%m-%d') AS date, total_sessions, adjusted_total_sessions FROM overall_summary WHERE date >= ? AND date <= ?`,
            { type: QueryTypes.SELECT, replacements: [start, end] }
          );
          debugInfo.overallRows = overallRows.slice(0, 5);
          overallMap = new Map(overallRows.map(r => {
            const d = String(r.date);
            return [d, { total_sessions: Number(r.total_sessions || 0), adjusted_total_sessions: r.adjusted_total_sessions == null ? null : Number(r.adjusted_total_sessions) }];
          }));
        }

        const points = dayList.map(d => {
          let metrics = map.get(d);
          if (!metrics) {
            // If no sales data, initialize zero metrics
            metrics = { sales: 0, orders: 0, sessions: 0, adjusted_sessions: 0, raw_sessions: 0, atc: 0 };
          }

          // If filtering by product OR UTM filters, override sessions/atc
          if (filters.product_id) {
            const productData = productSessionsMap.get(d) || { sessions: 0, atc: 0 };
            metrics.sessions = productData.sessions;
            metrics.adjusted_sessions = productData.sessions;
            metrics.raw_sessions = productData.sessions;
            metrics.atc = productData.atc;
          } else if (hasFilters) {
            const utmData = utmSessionsMap.get(d) || { sessions: 0, atc: 0 };
            metrics.sessions = utmData.sessions;
            metrics.adjusted_sessions = utmData.sessions;
            metrics.raw_sessions = utmData.sessions;
            metrics.atc = utmData.atc;
          }

          const over = overallMap.get(d);
          const pSess = productSessionsMap.get(d);

          // Priority Logic for Sessions:
          // 1. adjusted_total_sessions (overall_summary)
          // 2. total_sessions (overall_summary)
          // 3. metrics.sessions (hour_wise_sales or product sessions or UTM sessions)
          let bestSession = metrics.sessions;
          let bestAtc = metrics.atc;

          if (filters.product_id && pSess) {
            bestSession = Number(pSess.sessions || 0);
            bestAtc = Number(pSess.atc || 0);
            metrics.adjusted_sessions = bestSession; // Assume same for product level view
            metrics.raw_sessions = bestSession;
          } else if (over) {
            if (over.adjusted_total_sessions != null) {
              bestSession = over.adjusted_total_sessions;
            } else if (over.total_sessions != null) {
              bestSession = over.total_sessions;
            }
          }

          const cvrRatio = bestSession > 0 ? metrics.orders / bestSession : 0;
          return { date: d, metrics: { sales: metrics.sales, orders: metrics.orders, sessions: bestSession, adjusted_sessions: metrics.adjusted_sessions, raw_sessions: metrics.raw_sessions, atc: bestAtc, cvr_ratio: cvrRatio, cvr_percent: cvrRatio * 100 } };
        });

        let comparison = null;
        const prevWin = previousWindow(start, end);
        if (prevWin?.prevStart && prevWin?.prevEnd) {
          let compSql = `
            SELECT DATE_FORMAT(date, '%Y-%m-%d') AS date, 
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
          let compReplacements = [prevWin.prevStart, prevWin.prevEnd];

          if (hasFilters) {
            const salesExpr = filters.product_id
              ? `COALESCE(SUM((line_item_price - COALESCE(discount_amount_per_line_item, 0)) * line_item_quantity), 0)`
              : `SUM(total_price)`;

            compSql = `SELECT DATE_FORMAT(created_date, '%Y-%m-%d') AS date, 
                         ${salesExpr} AS sales, 
                         COUNT(DISTINCT order_name) AS orders,
                         0 AS sessions, 
                         0 AS adjusted_sessions, 
                         0 AS raw_sessions, 
                         0 AS atc 
                  FROM shopify_orders 
                  WHERE created_date >= ? AND created_date <= ?`;
            compSql = appendUtmWhere(compSql, compReplacements, filters);
            if (filters.product_id) { compSql += ` AND product_id = ?`; compReplacements.push(filters.product_id); }
            compSql += ` GROUP BY date ORDER BY date ASC`;
          }

          // NEW: Fetch Comparison UTM Sessions
          let compUtmSessionsMap = new Map();
          if (hasFilters && !filters.product_id) {
            try {
              let compUtmSessSql = `SELECT DATE_FORMAT(date, '%Y-%m-%d') as date, SUM(sessions) as sessions, SUM(sessions_with_cart_additions) as atc FROM product_sessions_snapshot WHERE date >= ? AND date <= ?`;
              const compUtmSessReplacements = [prevWin.prevStart, prevWin.prevEnd];
              compUtmSessSql = appendUtmWhere(compUtmSessSql, compUtmSessReplacements, { ...filters, sales_channel: null }, true);
              compUtmSessSql += ` GROUP BY date`;

              const compUtmSessRows = await req.brandDb.sequelize.query(compUtmSessSql, { type: QueryTypes.SELECT, replacements: compUtmSessReplacements });
              compUtmSessRows.forEach(r => {
                compUtmSessionsMap.set(String(r.date), { sessions: Number(r.sessions || 0), atc: Number(r.atc || 0) });
              });
            } catch (err) {
              console.warn('[dailyTrend] Failed to fetch comparison UTM sessions', err);
            }
          }

          const rowsPrev = await req.brandDb.sequelize.query(compSql, { type: QueryTypes.SELECT, replacements: compReplacements });

          // NEW: Fetch Comparison Product Sessions
          let compProductSessionsMap = new Map();
          if (filters.product_id) {
            try {
              let sessionSql = `SELECT DATE_FORMAT(date, '%Y-%m-%d') as date, SUM(sessions) as sessions, SUM(sessions_with_cart_additions) as atc FROM mv_product_sessions_by_path_daily WHERE date >= ? AND date <= ?`;
              const sessionReplacements = [prevWin.prevStart, prevWin.prevEnd];

              if (Array.isArray(filters.product_id)) {
                sessionSql += ` AND product_id IN (?)`;
                sessionReplacements.push(filters.product_id);
              } else {
                sessionSql += ` AND product_id = ?`;
                sessionReplacements.push(filters.product_id);
              }
              sessionSql += ` GROUP BY date`;

              const sessionRows = await req.brandDb.sequelize.query(sessionSql, { type: QueryTypes.SELECT, replacements: sessionReplacements });
              sessionRows.forEach(r => {
                compProductSessionsMap.set(String(r.date), { sessions: Number(r.sessions || 0), atc: Number(r.atc || 0) });
              });
            } catch (err) {
              console.warn('[dailyTrend] Failed to fetch comparison product sessions', err);
            }
          }


          const mapPrev = new Map(rowsPrev.map(r => {
            const d = String(r.date);
            let sessions = Number(r.sessions || 0);
            let adjusted = Number(r.adjusted_sessions || 0);
            let raw = Number(r.raw_sessions || 0);

            if (filters.product_id) {
              // Override sessions with data from MV for comparison
              const productData = compProductSessionsMap.get(d) || { sessions: 0, atc: 0 };
              sessions = productData.sessions;
              adjusted = productData.sessions;
              raw = productData.sessions;
            } else if (hasFilters) {
              // Use UTM sessions
              const utmData = compUtmSessionsMap.get(d) || { sessions: 0, atc: 0 };
              sessions = utmData.sessions;
              adjusted = utmData.sessions;
              raw = utmData.sessions;
            }

            return [d, { sales: Number(r.sales || 0), orders: Number(r.orders || 0), sessions, adjusted_sessions: adjusted, raw_sessions: raw, atc: Number(r.atc || 0) }];
          }));

          let overallMapPrev = new Map();
          if (!hasFilters) {
            const overallRowsPrev = await req.brandDb.sequelize.query(
              `SELECT DATE_FORMAT(date, '%Y-%m-%d') AS date, total_sessions, adjusted_total_sessions FROM overall_summary WHERE date >= ? AND date <= ?`,
              { type: QueryTypes.SELECT, replacements: [prevWin.prevStart, prevWin.prevEnd] }
            );
            overallMapPrev = new Map(overallRowsPrev.map(r => {
              const d = String(r.date);
              return [d, { total_sessions: Number(r.total_sessions || 0), adjusted_total_sessions: r.adjusted_total_sessions == null ? null : Number(r.adjusted_total_sessions) }];
            }));
          }

          const prevPoints = [];
          for (let ts = parseIsoDate(prevWin.prevStart).getTime(); ts <= parseIsoDate(prevWin.prevEnd).getTime(); ts += DAY_MS) {
            const d = formatIsoDate(new Date(ts));
            let metrics = mapPrev.get(d);

            if (!metrics) {
              metrics = { sales: 0, orders: 0, sessions: 0, adjusted_sessions: 0, raw_sessions: 0, atc: 0 };
            }

            // Fallback: If filtering by product OR UTM filters, use appropriate map
            if (filters.product_id) {
              const productData = compProductSessionsMap.get(d) || { sessions: 0, atc: 0 };
              metrics.sessions = productData.sessions;
              metrics.adjusted_sessions = productData.sessions;
              metrics.raw_sessions = productData.sessions;
              metrics.atc = productData.atc;
            } else if (hasFilters) {
              const utmData = compUtmSessionsMap.get(d) || { sessions: 0, atc: 0 };
              metrics.sessions = utmData.sessions;
              metrics.adjusted_sessions = utmData.sessions;
              metrics.raw_sessions = utmData.sessions;
              metrics.atc = utmData.atc;
            }

            const over = overallMapPrev.get(d);
            const pSess = compProductSessionsMap.get(d);

            // Comparison Priority Logic
            let bestSession = metrics.sessions;
            let bestAtc = metrics.atc;

            if (filters.product_id && pSess) {
              bestSession = Number(pSess.sessions || 0);
              bestAtc = Number(pSess.atc || 0);
              metrics.adjusted_sessions = bestSession;
              metrics.raw_sessions = bestSession;
            } else if (over) {
              if (over.adjusted_total_sessions != null) {
                bestSession = over.adjusted_total_sessions;
              } else if (over.total_sessions != null) {
                bestSession = over.total_sessions;
              }
            }

            const cvrRatio = bestSession > 0 ? metrics.orders / bestSession : 0;
            prevPoints.push({ date: d, metrics: { sales: metrics.sales, orders: metrics.orders, sessions: bestSession, adjusted_sessions: metrics.adjusted_sessions, raw_sessions: metrics.raw_sessions, atc: bestAtc, cvr_ratio: cvrRatio, cvr_percent: cvrRatio * 100 } });
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

        const filters = extractFilters(req);
        const hasFilters = !!(filters.utm_source || filters.utm_medium || filters.utm_campaign || filters.product_id || filters.sales_channel);

        let sql = `
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
        let replacements = [start, end];

        let sessionsSql = `
          SELECT 
            DATE_FORMAT(date, '%Y-%m-01') AS month_start,
            SUM(total_sessions) AS total_sessions,
            SUM(adjusted_total_sessions) AS adjusted_total_sessions
          FROM overall_summary
          WHERE date >= ? AND date <= ?
          GROUP BY month_start
          ORDER BY month_start ASC`;
        let sessionsReplacements = [start, end];

        if (hasFilters) {
          const salesExpr = filters.product_id
            ? `COALESCE(SUM((line_item_price - COALESCE(discount_amount_per_line_item, 0)) * line_item_quantity), 0)`
            : `SUM(total_price)`;

          sql = `SELECT DATE_FORMAT(created_date, '%Y-%m-01') AS month_start, 
                       MIN(created_date) AS start_date, 
                       MAX(created_date) AS end_date, 
                       ${salesExpr} AS sales, 
                       COUNT(DISTINCT order_name) AS orders, 
                       0 AS atc 
                FROM shopify_orders 
                WHERE created_date >= ? AND created_date <= ?`;
          sql = appendUtmWhere(sql, replacements, filters);
          if (filters.product_id) { sql += ` AND product_id = ?`; replacements.push(filters.product_id); }
          sql += ` GROUP BY month_start ORDER BY month_start ASC`;

          sessionsSql = null;
        }

        const [rows, sessionsRows] = await Promise.all([
          req.brandDb.sequelize.query(sql, { type: QueryTypes.SELECT, replacements: replacements }),
          sessionsSql ? req.brandDb.sequelize.query(sessionsSql, { type: QueryTypes.SELECT, replacements: sessionsReplacements }) : Promise.resolve([])
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
          let compSql = `
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
          let compReplacements = [prevWin.prevStart, prevWin.prevEnd];

          let compSessSql = `
            SELECT 
              DATE_FORMAT(date, '%Y-%m-01') AS month_start,
              SUM(total_sessions) AS total_sessions,
              SUM(adjusted_total_sessions) AS adjusted_total_sessions
            FROM overall_summary
            WHERE date >= ? AND date <= ?
            GROUP BY month_start
            ORDER BY month_start ASC`;
          let compSessReplacements = [prevWin.prevStart, prevWin.prevEnd];

          if (hasFilters) {
            const salesExpr = filters.product_id
              ? `COALESCE(SUM((line_item_price - COALESCE(discount_amount_per_line_item, 0)) * line_item_quantity), 0)`
              : `SUM(total_price)`;

            compSql = `SELECT DATE_FORMAT(created_date, '%Y-%m-01') AS month_start, 
                         MIN(created_date) AS start_date, 
                         MAX(created_date) AS end_date, 
                         ${salesExpr} AS sales, 
                         COUNT(DISTINCT order_name) AS orders, 
                         0 AS atc 
                  FROM shopify_orders 
                  WHERE created_date >= ? AND created_date <= ?`;
            compSql = appendUtmWhere(compSql, compReplacements, filters);
            if (filters.product_id) { compSql += ` AND product_id = ?`; compReplacements.push(filters.product_id); }
            compSql += ` GROUP BY month_start ORDER BY month_start ASC`;

            compSessSql = null;
          }

          const [rowsPrev, sessionsRowsPrev] = await Promise.all([
            req.brandDb.sequelize.query(compSql, { type: QueryTypes.SELECT, replacements: compReplacements }),
            compSessSql ? req.brandDb.sequelize.query(compSessSql, { type: QueryTypes.SELECT, replacements: compSessReplacements }) : Promise.resolve([])
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
          ['atc_rate', 'atc_rate'],
          ['orders', 'orders'],
          ['sales', 'sales'],
          ['cvr', 'cvr'],
          ['landing_page_path', 'landing_page_path'],
        ]);
        const sortCol = allowedSort.get(sortBy) || 'sessions';
        const dir = sortDir === 'asc' ? 'ASC' : 'DESC';



        const validFields = ['sessions', 'atc', 'atc_rate', 'orders', 'sales', 'cvr'];
        const validOps = ['gt', 'lt'];
        let whereClause = '';
        const filterReplacements = [];

        // Parse filters from query: expect JSON array string or nothing
        let filters = [];
        try {
          if (req.query.filters) {
            filters = typeof req.query.filters === 'string' ? JSON.parse(req.query.filters) : req.query.filters;
          }
        } catch (e) {
          filters = [];
        }

        // Also support legacy single filter params or if frontend sends them separately
        const singleField = (req.query.filter_field || '').toString().toLowerCase();
        if (filters.length === 0 && singleField) {
          filters.push({
            field: singleField,
            operator: (req.query.filter_operator || '').toString().toLowerCase(),
            value: req.query.filter_value
          });
        }


        const conditions = [];
        const search = (req.query.search || '').trim();
        if (search) {
          conditions.push(`s.landing_page_path LIKE ?`);
          filterReplacements.push(`%${search}%`);
        }

        let productTypes = req.query.product_types;
        if (typeof productTypes === 'string') {
          try { productTypes = JSON.parse(productTypes); } catch (e) { productTypes = []; }
        }

        if (Array.isArray(productTypes) && productTypes.length > 0) {
          // If filtering by product types, we want to show ALL products in that type, even if 0 sessions.
          // Condition moved to WHERE clause of main query, but we also flag to switch base table.
        }

        if (Array.isArray(filters) && filters.length > 0) {
          for (const f of filters) {
            const fField = (f.field || '').toString().toLowerCase();
            const fOp = (f.operator || '').toString().toLowerCase();
            const fVal = Number(f.value);

            if (validFields.includes(fField) && validOps.includes(fOp) && !Number.isNaN(fVal)) {
              let fieldExpr = '';
              switch (fField) {
                case 'sessions': fieldExpr = 's.sessions'; break;
                case 'atc': fieldExpr = 's.atc'; break;
                case 'atc_rate': fieldExpr = '(CASE WHEN s.sessions > 0 THEN s.atc / s.sessions * 100 ELSE 0 END)'; break;
                case 'orders': fieldExpr = 'COALESCE(o.orders, 0)'; break;
                case 'sales': fieldExpr = 'COALESCE(o.sales, 0)'; break;
                case 'cvr': fieldExpr = '(CASE WHEN s.sessions > 0 THEN COALESCE(o.orders, 0) / s.sessions * 100 ELSE 0 END)'; break;
              }

              if (fieldExpr) {
                const operator = fOp === 'gt' ? '>' : '<';
                conditions.push(`${fieldExpr} ${operator} ?`);
                filterReplacements.push(fVal);
              }
            }
          }
        }

        const replacements = [start, end, start, end, ...filterReplacements];
        const baseCte = `
          WITH orders_60d AS (
            SELECT
              product_id,
              COUNT(DISTINCT order_name) AS orders,
              SUM((line_item_price * line_item_quantity) - COALESCE(discount_amount_per_line_item, 0)) AS sales
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
            GROUP BY product_id, landing_page_path
          )
        `;

        let sql, countSql;

        if (Array.isArray(productTypes) && productTypes.length > 0) {
          conditions.push(`m.product_type IN (?)`);
          filterReplacements.push(productTypes);

          if (conditions.length > 0) {
            whereClause = `WHERE ${conditions.join(' AND ')}`;
          }

          // Re-build replacements order: [start, end, start, end, ...filterReplacements]
          // Note: filterReplacements now includes productTypes at the end
          const finalReplacements = [start, end, start, end, ...filterReplacements];

          sql = `
            ${baseCte}
            SELECT
              m.product_id,
              m.landing_page_path,
              COALESCE(s.sessions, 0) AS sessions,
              COALESCE(s.atc, 0) AS atc,
              CASE WHEN s.sessions > 0 THEN ROUND(s.atc / s.sessions * 100, 4) ELSE 0 END AS atc_rate,
              COALESCE(o.orders, 0) AS orders,
              COALESCE(o.sales, 0) AS sales,
              CASE WHEN s.sessions > 0 THEN ROUND(COALESCE(o.orders, 0) / s.sessions * 100, 4) ELSE 0 END AS cvr
            FROM product_landing_mapping m
            LEFT JOIN sessions_60d s ON m.landing_page_path = s.landing_page_path
            LEFT JOIN orders_60d o ON m.product_id = o.product_id
            ${whereClause}
            ORDER BY ${sortCol} ${dir}
            LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
          `;

          countSql = `
            ${baseCte}
            SELECT COUNT(*) AS total_count FROM (
              SELECT 1
              FROM product_landing_mapping m
              LEFT JOIN sessions_60d s ON m.landing_page_path = s.landing_page_path
              LEFT JOIN orders_60d o ON m.product_id = o.product_id
              ${whereClause}
            ) AS filtered
          `;

          const [rowsRAW, countRows] = await Promise.all([
            conn.query(sql, { type: QueryTypes.SELECT, replacements: finalReplacements }),
            conn.query(countSql, { type: QueryTypes.SELECT, replacements: finalReplacements }),
          ]);
          rows = rowsRAW.map(r => ({ ...r, previous: null }));
          total = Number(countRows?.[0]?.total_count || 0);

        } else {
          // Default behavior: Drive from sessions
          if (conditions.length > 0) {
            whereClause = `WHERE ${conditions.join(' AND ')}`;
          }
          const finalReplacements = [start, end, start, end, ...filterReplacements];

          sql = `
            ${baseCte}
            SELECT
              s.product_id,
              s.landing_page_path,
              s.sessions,
              s.atc,
              CASE WHEN s.sessions > 0 THEN ROUND(s.atc / s.sessions * 100, 4) ELSE 0 END AS atc_rate,
              COALESCE(o.orders, 0) AS orders,
              COALESCE(o.sales, 0) AS sales,
              CASE WHEN s.sessions > 0 THEN ROUND(COALESCE(o.orders, 0) / s.sessions * 100, 4) ELSE 0 END AS cvr
            FROM sessions_60d s
            LEFT JOIN orders_60d o
              ON s.product_id = o.product_id
            ${whereClause}
            ORDER BY ${sortCol} ${dir}
            LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
          `;

          countSql = `
            ${baseCte}
            SELECT COUNT(*) AS total_count FROM (
              SELECT 1
              FROM sessions_60d s
              LEFT JOIN orders_60d o ON s.product_id = o.product_id
              ${whereClause}
            ) AS filtered
          `;

          const [rowsRAW, countRows] = await Promise.all([
            conn.query(sql, { type: QueryTypes.SELECT, replacements: finalReplacements }),
            conn.query(countSql, { type: QueryTypes.SELECT, replacements: finalReplacements }),
          ]);
          rows = rowsRAW.map(r => ({ ...r, previous: null }));
          total = Number(countRows?.[0]?.total_count || 0);
        }

        // --- Comparison Logic ---
        const compareStart = req.query.compare_start;
        const compareEnd = req.query.compare_end;
        if (compareStart && compareEnd && rows.length > 0) {
          const productIds = [...new Set(rows.map(r => r.product_id).filter(Boolean))];
          const paths = [...new Set(rows.map(r => r.landing_page_path).filter(Boolean))];

          if (productIds.length > 0 || paths.length > 0) {
            try {
              // 1. Fetch Previous Orders (by Product ID, compatible with main query logic)
              let prevOrdersMap = new Map();
              if (productIds.length > 0) {
                const ordersSql = `
                  SELECT
                    product_id,
                    COUNT(DISTINCT order_name) AS orders,
                    SUM((line_item_price - COALESCE(discount_amount_per_line_item, 0)) * line_item_quantity) AS sales
                  FROM shopify_orders
                  WHERE created_date >= ? AND created_date <= ?
                    AND product_id IN (?)
                  GROUP BY product_id
                `;
                const ordersRows = await conn.query(ordersSql, { type: QueryTypes.SELECT, replacements: [compareStart, compareEnd, productIds] });
                ordersRows.forEach(r => prevOrdersMap.set(r.product_id, { orders: Number(r.orders || 0), sales: Number(r.sales || 0) }));
              }

              // 2. Fetch Previous Sessions (by Landing Page Path, to match granular rows)
              let prevSessionsMap = new Map();
              if (paths.length > 0) {
                console.log('[DEBUG] Fetching comparison sessions for paths:', paths.length, 'Start:', compareStart, 'End:', compareEnd);
                const sessionsSql = `
                  SELECT
                    landing_page_path,
                    SUM(sessions) AS sessions,
                    SUM(sessions_with_cart_additions) AS atc
                  FROM mv_product_sessions_by_path_daily
                  WHERE date >= ? AND date <= ?
                    AND landing_page_path IN (?)
                  GROUP BY landing_page_path
                `;
                const sessionsRows = await conn.query(sessionsSql, { type: QueryTypes.SELECT, replacements: [compareStart, compareEnd, paths] });
                console.log('[DEBUG] Comparison sessions rows found:', sessionsRows.length);
                if (sessionsRows.length > 0) {
                  console.log('[DEBUG] Sample row:', sessionsRows[0]);
                } else {
                  console.log('[DEBUG] No session rows found for paths:', JSON.stringify(paths));
                }
                sessionsRows.forEach(r => prevSessionsMap.set(r.landing_page_path, { sessions: Number(r.sessions || 0), atc: Number(r.atc || 0) }));
              }

              // 3. Merge into rows
              rows = rows.map(r => {
                const pOrders = prevOrdersMap.get(r.product_id) || { orders: 0, sales: 0 };
                const pSessions = prevSessionsMap.get(r.landing_page_path) || { sessions: 0, atc: 0 };

                // Calculate derived metrics
                // Note: ATC Rate and CVR are derived
                const atcRate = pSessions.sessions > 0 ? (pSessions.atc / pSessions.sessions * 100) : 0;
                const cvr = pSessions.sessions > 0 ? (pOrders.orders / pSessions.sessions * 100) : 0;

                return {
                  ...r,
                  previous: {
                    orders: pOrders.orders,
                    sales: pOrders.sales,
                    sessions: pSessions.sessions,
                    atc: pSessions.atc,
                    atc_rate: atcRate,
                    cvr: cvr
                  }
                };
              });

            } catch (e) { console.error('[product-conversion] comparison logic failed', e); }
          }
        }

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

    productTypes: async (req, res) => {
      try {
        const conn = req.brandDb?.sequelize;
        if (!conn) return res.status(500).json({ error: "Brand DB connection unavailable" });

        const date = req.query.date || formatIsoDate(new Date());

        // Select distinct product types (ignoring date as mapping is current-state only)
        const sql = `
          SELECT DISTINCT product_type 
          FROM product_landing_mapping 
          WHERE product_type IS NOT NULL 
            AND product_type != ''
          ORDER BY product_type ASC
        `;

        const types = await conn.query(sql, {
          type: QueryTypes.SELECT
        });

        // Return array of strings
        return res.json({
          date,
          types: types.map(t => t.product_type)
        });
      } catch (e) {
        console.error('[product-types] failed', e);
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

        let visibleColumns = req.query.visible_columns;
        if (typeof visibleColumns === 'string') {
          try { visibleColumns = JSON.parse(visibleColumns); } catch (e) { visibleColumns = null; }
        }

        const page = Number(req.query.page) || 0;
        const pageSize = Number(req.query.page_size) || 0;

        const allowedSort = new Map([
          ['sessions', 'sessions'],
          ['atc', 'atc'],
          ['atc_rate', 'atc_rate'],
          ['orders', 'orders'],
          ['sales', 'sales'],
          ['cvr', 'cvr'],
          ['landing_page_path', 'landing_page_path'],
        ]);
        const sortCol = allowedSort.get(sortBy) || 'sessions';
        const dir = sortDir === 'asc' ? 'ASC' : 'DESC';

        const validFields = ['sessions', 'atc', 'atc_rate', 'orders', 'sales', 'cvr'];
        const validOps = ['gt', 'lt'];

        let filters = req.query.filters;
        if (typeof filters === 'string') {
          try { filters = JSON.parse(filters); } catch (e) { filters = []; }
        }
        const search = (req.query.search || '').trim();
        const conditions = [];
        const filterReplacements = [];

        if (search) {
          conditions.push(`s.landing_page_path LIKE ?`);
          filterReplacements.push(`%${search}%`);
        }

        let productTypes = req.query.product_types;
        if (typeof productTypes === 'string') {
          try { productTypes = JSON.parse(productTypes); } catch (e) { productTypes = []; }
        }

        if (Array.isArray(productTypes) && productTypes.length > 0) {
          conditions.push(`s.landing_page_path IN (
             SELECT landing_page_path 
             FROM product_landing_mapping 
             WHERE product_type IN (?) 
           )`);
          filterReplacements.push(productTypes);
        }

        if (Array.isArray(filters) && filters.length > 0) {
          for (const f of filters) {
            const fField = (f.field || '').toString().toLowerCase();
            const fOp = (f.operator || '').toString().toLowerCase();
            const fVal = Number(f.value);

            if (validFields.includes(fField) && validOps.includes(fOp) && !Number.isNaN(fVal)) {
              let fieldExpr = '';
              switch (fField) {
                case 'sessions': fieldExpr = 's.sessions'; break;
                case 'atc': fieldExpr = 's.atc'; break;
                case 'atc_rate': fieldExpr = '(CASE WHEN s.sessions > 0 THEN s.atc / s.sessions * 100 ELSE 0 END)'; break;
                case 'orders': fieldExpr = 'COALESCE(o.orders, 0)'; break;
                case 'sales': fieldExpr = 'COALESCE(o.sales, 0)'; break;
                case 'cvr': fieldExpr = '(CASE WHEN s.sessions > 0 THEN COALESCE(o.orders, 0) / s.sessions * 100 ELSE 0 END)'; break;
              }

              if (fieldExpr) {
                const operator = fOp === 'gt' ? '>' : '<';
                conditions.push(`${fieldExpr} ${operator} ?`);
                filterReplacements.push(fVal);
              }
            }
          }
        }

        let whereClause = '';
        if (conditions.length > 0) {
          whereClause = `WHERE ${conditions.join(' AND ')}`;
        }

        const replacements = [start, end, start, end, ...filterReplacements];
        const fullSql = `
          WITH orders_60d AS (
            SELECT
              product_id,
              COUNT(DISTINCT order_name) AS orders,
              SUM((line_item_price - COALESCE(discount_amount_per_line_item, 0)) * line_item_quantity) AS sales
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
            GROUP BY product_id, landing_page_path
          )
          SELECT
            s.landing_page_path,
            s.sessions,
            s.atc,
            CASE WHEN s.sessions > 0 THEN ROUND(s.atc / s.sessions * 100, 4) ELSE 0 END AS atc_rate,
            COALESCE(o.orders, 0) AS orders,
            COALESCE(o.sales, 0) AS sales,
            CASE WHEN s.sessions > 0 THEN ROUND(COALESCE(o.orders, 0) / s.sessions * 100, 4) ELSE 0 END AS cvr
          FROM sessions_60d s
          LEFT JOIN orders_60d o
            ON s.product_id = o.product_id
          ${whereClause}
          ORDER BY ${sortCol} ${dir}
          ${(page > 0 && pageSize > 0) ? `LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}` : ''}
        `;
        const csvRows = await conn.query(fullSql, { type: QueryTypes.SELECT, replacements });

        const dateTag = (start && end)
          ? (start === end ? start : `${start}_to_${end}`)
          : formatIsoDate(new Date());
        const filename = `product_conversion_${dateTag}.csv`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        const allHeaders = ['landing_page_path', 'sessions', 'atc', 'atc_rate', 'orders', 'sales', 'cvr'];
        let finalHeaders = allHeaders;

        if (Array.isArray(visibleColumns) && visibleColumns.length > 0) {
          finalHeaders = allHeaders.filter(h => visibleColumns.includes(h) || h === 'landing_page_path');
        }

        const escapeCsv = (val) => {
          if (val === null || val === undefined) return '';
          const str = String(val);
          if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
          return str;
        };
        const lines = [finalHeaders.join(',')];
        for (const r of csvRows) {
          const rowVals = finalHeaders.map(h => {
            // Handle numeric formatting identical to previous code if needed, strictly based on header name
            if (h === 'landing_page_path') return escapeCsv(r.landing_page_path);
            return Number(r[h] || 0);
          });
          lines.push(rowVals.join(','));
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

    hourlySalesSummary: async (req, res) => {
      try {
        const brandKey = (req.brandKey || req.query.brand_key || '').toString().trim().toUpperCase();
        if (!brandKey) return res.status(400).json({ error: 'Brand key required' });

        const IST_OFFSET_MIN = 330;
        const nowUtc = new Date();
        const nowIst = new Date(nowUtc.getTime() + IST_OFFSET_MIN * 60 * 1000);

        const pad2 = (n) => String(n).padStart(2, '0');
        const formatDate = (d) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

        const todayStr = formatDate(nowIst);
        const yesterdayIst = new Date(nowIst.getTime() - 24 * 60 * 60 * 1000);
        const yesterdayStr = formatDate(yesterdayIst);

        const keyToday = `hourly_metrics:${brandKey.toLowerCase()}:${todayStr}`;
        const keyYesterday = `hourly_metrics:${brandKey.toLowerCase()}:${yesterdayStr}`;

        let todayData = null;
        let yesterdayData = null;
        let todaySource = 'db';
        let yesterdaySource = 'db';

        if (redisClient) {
          try {
            const results = await redisClient.mget(keyToday, keyYesterday);
            if (results[0]) {
              todayData = JSON.parse(results[0]);
              todaySource = 'redis';
            }
            if (results[1]) {
              yesterdayData = JSON.parse(results[1]);
              yesterdaySource = 'redis';
            }
            if (todayData) logger.debug(`[REDIS HIT] ${keyToday}`);
            else logger.debug(`[REDIS MISS] ${keyToday}`);
            if (yesterdayData) logger.debug(`[REDIS HIT] ${keyYesterday}`);
            else logger.debug(`[REDIS MISS] ${keyYesterday}`);
          } catch (err) {
            console.error('[hourlySalesSummary] Redis fetch failed', err.message);
          }
        }

        // Fallback to DB if missing
        if (!todayData || !yesterdayData) {
          const conn = req.brandDb.sequelize;
          const sql = `
            SELECT 
              hour,
              total_sales,
              number_of_orders,
              COALESCE(adjusted_number_of_sessions, number_of_sessions) AS number_of_sessions,
              number_of_atc_sessions
            FROM hour_wise_sales
            WHERE date = ?
            ORDER BY hour ASC
          `;

          if (!todayData) {
            const rows = await conn.query(sql, { type: QueryTypes.SELECT, replacements: [todayStr] });
            todayData = rows.map(r => ({
              hour: r.hour,
              total_sales: Number(r.total_sales || 0),
              number_of_orders: Number(r.number_of_orders || 0),
              number_of_sessions: Number(r.number_of_sessions || 0),
              number_of_atc_sessions: Number(r.number_of_atc_sessions || 0)
            }));
            logger.debug(`[DB FETCH] hourly sales for ${brandKey} on ${todayStr}`);
          }

          if (!yesterdayData) {
            const rows = await conn.query(sql, { type: QueryTypes.SELECT, replacements: [yesterdayStr] });
            yesterdayData = rows.map(r => ({
              hour: r.hour,
              total_sales: Number(r.total_sales || 0),
              number_of_orders: Number(r.number_of_orders || 0),
              number_of_sessions: Number(r.number_of_sessions || 0),
              number_of_atc_sessions: Number(r.number_of_atc_sessions || 0)
            }));
            logger.debug(`[DB FETCH] hourly sales for ${brandKey} on ${yesterdayStr}`);
          }
        }

        return res.json({
          metric: "HOURLY_SALES_SUMMARY",
          brand: brandKey,
          source: (todaySource === 'redis' && yesterdaySource === 'redis') ? 'redis' : (todaySource === 'redis' || yesterdaySource === 'redis' ? 'mixed' : 'db'),
          data: {
            today: { date: todayStr, source: todaySource, data: todayData || [] },
            yesterday: { date: yesterdayStr, source: yesterdaySource, data: yesterdayData || [] }
          }
        });

      } catch (e) {
        console.error('[hourlySalesSummary] failed', e);
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

        const filters = extractFilters(req);

        if (!req.brandDb && req.brandConfig) {
          try {
            req.brandDbName = req.brandConfig.dbName || req.brandConfig.key;
          } catch (connErr) {
            console.error("Lazy connection failed", connErr);
          }
        }
        const conn = req.brandDb ? req.brandDb.sequelize : null;
        if (!conn) throw new Error("Database connection missing for delta summary");

        const align = (req.query.align || '').toString().toLowerCase();
        const compare = (req.query.compare || '').toString().toLowerCase();

        const isSingleDay = start === end;
        const hasFilters = !!(filters.utm_source || filters.utm_medium || filters.utm_campaign);

        let orders, sales, sessions, atc, aov, cvr;
        let usedCache = false;

        if (isSingleDay && !hasFilters && !align && !compare) {
          try {
            const prevWin = previousWindow(start, end);
            const [cached, cachedPrev] = await fetchCachedMetricsBatch(brandQuery, [start, prevWin.prevStart]);

            if (cached && cachedPrev) {
              const calcDeltaLocal = (cur, prev) => {
                const diff = cur - prev;
                const diff_pct = prev > 0 ? (diff / prev) * 100 : (cur > 0 ? 100 : 0);
                const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
                return { diff_pct, direction };
              };

              const mkMetric = (key, metricName) => {
                const c = cached[key] || 0;
                const p = cachedPrev[key] || 0;
                const d = calcDeltaLocal(c, p);
                return { metric: metricName, range: { start, end }, current: c, previous: p, diff_pct: d.diff_pct, direction: d.direction, source: 'cache' };
              };

              orders = mkMetric('total_orders', 'TOTAL_ORDERS_DELTA');
              sales = mkMetric('total_sales', 'TOTAL_SALES_DELTA');
              sessions = mkMetric('total_sessions', 'TOTAL_SESSIONS_DELTA');
              atc = mkMetric('total_atc_sessions', 'TOTAL_ATC_SESSIONS_DELTA');
              // AOV and CVR need special handling or just use raw numbers from cache if available
              // Cache usually stores aov/cvr pre-calculated? getMetricsForRange in dashboardSummary uses cached.average_order_value
              aov = mkMetric('average_order_value', 'AOV_DELTA');
              cvr = mkMetric('conversion_rate', 'CVR_DELTA'); // conversion_rate in cache is usually a number (rate or percent? dashboardSummary says conversion_rate_percent: cached.conversion_rate)

              usedCache = true;
              logger.debug(`[deltaSummary] Served from cache for ${brandQuery} ${start}`);
            }
          } catch (e) {
            console.error('[deltaSummary] Cache fetch failed', e);
          }
        }

        if (!usedCache) {
          [orders, sales, sessions, atc, aov, cvr] = await Promise.all([
            calcTotalOrdersDelta({ start, end, align, compare, conn, filters }),
            calcTotalSalesDelta({ start, end, align, compare, conn, filters }),
            calcTotalSessionsDelta({ start, end, align, compare, conn, filters }),
            calcAtcSessionsDelta({ start, end, align, compare, conn, filters }),
            calcAovDelta({ start, end, align, compare, conn, filters }),
            calcCvrDelta({ start, end, align, compare, conn, filters })
          ]);
        }

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

        const filters = extractFilters(req);
        const hasFilters = !!(filters.utm_source || filters.utm_medium || filters.utm_campaign || filters.sales_channel || filters.device_type);

        const traceStart = req._reqStart || Date.now();
        const spans = [];
        const mark = (label, since) => spans.push({ label, ms: Date.now() - (since || traceStart) });
        mark('params');

        const isSingleDay = start === end;
        const prevWin = previousWindow(start, end);
        const prevStart = prevWin?.prevStart;
        const prevEnd = prevWin?.prevEnd;

        logger.debug(`[SUMMARY] Fetching for ${brandQuery} range ${start} to ${end}${prevStart && prevEnd ? ` (prev: ${prevStart} to ${prevEnd})` : ''}`);
        const cacheFetchStart = Date.now();

        // Batch fetch from cache when single-day so we can reuse existing cache keys.
        const [cached, cachedPrev] = (isSingleDay && !hasFilters)
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
            logger.debug(`[LAZY CONNECT] Connecting to ${req.brandConfig.key} for fallback`);
            try {
              req.brandDbName = req.brandConfig.dbName || req.brandConfig.key;
            } catch (connErr) {
              console.error("Lazy connection failed", connErr);
            }
          }
          const conn = req.brandDb ? req.brandDb.sequelize : null;
          if (!conn) throw new Error("Database connection missing (tenant router required)");

          const [sales, orders, sessions, atc, cvrObj, aovObj] = await Promise.all([
            computeTotalSales({ start: s, end: e, conn, filters }),
            computeTotalOrders({ start: s, end: e, conn, filters }),
            computeTotalSessions({ start: s, end: e, conn, filters }),
            computeAtcSessions({ start: s, end: e, conn, filters }),
            computeCVR({ start: s, end: e, conn, filters }),
            aovForRange({ start: s, end: e, conn, filters })
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


        const nowUtc = new Date();
        const nowIst = new Date(nowUtc.getTime() + (330 * 60 * 1000)); // IST_OFFSET_MIN = 330
        const pad2 = (n) => String(n).padStart(2, '0');
        const todayIstStr = `${nowIst.getUTCFullYear()}-${pad2(nowIst.getUTCMonth() + 1)}-${pad2(nowIst.getUTCDate())}`;
        const isTodayIst = isSingleDay && start === todayIstStr;

        let total_orders, total_sales, average_order_value, conversion_rate, total_sessions, total_atc_sessions;
        let sources = { current: 'db', previous: 'db' };

        if (isTodayIst) {
          // Use time-aligned delta calculation
          if (!req.brandDb && req.brandConfig) {
            try { req.brandDbName = req.brandConfig.dbName || req.brandConfig.key; } catch (e) { }
          }
          const conn = req.brandDb ? req.brandDb.sequelize : null;
          if (!conn) throw new Error("Database connection missing (tenant router required)");

          const [ordersRes, salesRes, sessionsRes, atcRes, aovRes, cvrRes] = await Promise.all([
            calcTotalOrdersDelta({ start, end, align: 'hour', conn, filters }),
            calcTotalSalesDelta({ start, end, align: 'hour', conn, filters }),
            calcTotalSessionsDelta({ start, end, align: 'hour', conn, filters }),
            calcAtcSessionsDelta({ start, end, align: 'hour', conn, filters }),
            calcAovDelta({ start, end, align: 'hour', conn, filters }),
            calcCvrDelta({ start, end, align: 'hour', conn, filters })
          ]);

          let deltaOrdersRes, deltaSalesRes, deltaSessionsRes, deltaAtcRes, deltaAovRes, deltaCvrRes;

          // If sales_channel is active, we also fetch "Global" (unfiltered by channel) deltas
          if (filters.sales_channel) {
            const { sales_channel, ...filtersWithoutChannel } = filters;
            logger.debug(`[HYBRID DELTA] Fetching global deltas (ignoring sales_channel: ${filters.sales_channel})`);

            [deltaOrdersRes, deltaSalesRes, deltaSessionsRes, deltaAtcRes, deltaAovRes, deltaCvrRes] = await Promise.all([
              calcTotalOrdersDelta({ start, end, align: 'hour', conn, filters: filtersWithoutChannel }),
              calcTotalSalesDelta({ start, end, align: 'hour', conn, filters: filtersWithoutChannel }),
              calcTotalSessionsDelta({ start, end, align: 'hour', conn, filters: filtersWithoutChannel }),
              calcAtcSessionsDelta({ start, end, align: 'hour', conn, filters: filtersWithoutChannel }),
              calcAovDelta({ start, end, align: 'hour', conn, filters: filtersWithoutChannel }),
              calcCvrDelta({ start, end, align: 'hour', conn, filters: filtersWithoutChannel })
            ]);
          }

          const mkMetric = (res, deltaRes) => {
            // Use current/previous from PRIMARY (Filtered) result for VALUE display
            // But if deltaRes exists, use ITS diff_pct and direction for the DELTA pill.
            const sourceForDelta = deltaRes || res;

            return {
              value: res.current,
              previous: res.previous,
              diff: res.current - res.previous,
              diff_pct: sourceForDelta.diff_pct,
              direction: sourceForDelta.direction
            };
          };

          total_orders = mkMetric(ordersRes, deltaOrdersRes);
          total_sales = mkMetric(salesRes, deltaSalesRes);
          total_sessions = mkMetric(sessionsRes, deltaSessionsRes);
          total_atc_sessions = mkMetric(atcRes, deltaAtcRes);
          average_order_value = mkMetric(aovRes, deltaAovRes);

          // CVR is special snowflake
          if (typeof cvrRes.current === 'number') {
            conversion_rate = mkMetric(cvrRes, deltaCvrRes);
          } else {
            const curPct = cvrRes.current.cvr_percent || 0;
            const prevPct = cvrRes.previous.cvr_percent || 0;

            // For delta source
            const sourceForDelta = deltaCvrRes || cvrRes;
            let d;
            if (deltaCvrRes && typeof deltaCvrRes.current !== 'number') {
              const dCur = deltaCvrRes.current.cvr_percent || 0;
              const dPrev = deltaCvrRes.previous.cvr_percent || 0;
              d = computePercentDelta(dCur, dPrev);
            } else {
              // Fallback or no delta override
              d = computePercentDelta(curPct, prevPct);
            }

            conversion_rate = {
              value: curPct,
              previous: prevPct,
              diff: d.diff_pp,
              diff_pct: d.diff_pct,
              direction: d.direction
            };
          }

        } else {
          // Standard full-day calculation (existing logic)
          // 1. Fetch filtered metrics (Primary)
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
          sources = { current: current?.source || 'db', previous: previous?.source || 'db' };

          // 2. If sales_channel active, fetch UNFILTERED metrics (Secondary) for deltas
          let currentGlobal = current;
          let previousGlobal = previous;

          if (filters.sales_channel) {
            const { sales_channel, ...filtersWithoutChannel } = filters;
            // We can't easily reuse 'cached' here because it might be keyed differently or we skipped cache logic above.
            // For simplicity/safety on this precise requirement, let's just fetch DB for global stats if needed, 
            // OR assume cache is unfiltered? 
            // Actually, the 'cached' variable above is fetched via `fetchCachedMetricsBatch`, which relies on `brandQuery` 
            // to generate keys. If brandQuery doesn't include filtering params, `cached` IS the global data.

            // Check lines 3019: const [cached, cachedPrev] = (isSingleDay && !hasFilters) ...
            // If we HAVE filters (sales_channel), `cached` is likely null.
            // So we must fetch global data from DB.
            logger.debug(`[HYBRID DELTA] Fetching global full-day metrics for delta override`);

            // Define helper to fetch without channel
            const getGlobalMetrics = async (s, e) => {
              if (!s || !e) return null;
              const conn = req.brandDb ? req.brandDb.sequelize : null;
              if (!conn) return null; // Should be connected by now
              const [sales, orders, sessions, atc, cvrObj, aovObj] = await Promise.all([
                computeTotalSales({ start: s, end: e, conn, filters: filtersWithoutChannel }),
                computeTotalOrders({ start: s, end: e, conn, filters: filtersWithoutChannel }),
                computeTotalSessions({ start: s, end: e, conn, filters: filtersWithoutChannel }),
                computeAtcSessions({ start: s, end: e, conn, filters: filtersWithoutChannel }),
                computeCVR({ start: s, end: e, conn, filters: filtersWithoutChannel }),
                aovForRange({ start: s, end: e, conn, filters: filtersWithoutChannel })
              ]);
              const aovVal = typeof aovObj === 'object' && aovObj !== null ? Number(aovObj.aov || 0) : Number(aovObj || 0);
              return {
                total_orders: orders,
                total_sales: sales,
                total_sessions: sessions,
                total_atc_sessions: atc,
                average_order_value: aovVal,
                conversion_rate_percent: cvrObj.cvr_percent,
              };
            };

            const [globCur, globPrev] = await Promise.all([
              getGlobalMetrics(start, end),
              getGlobalMetrics(prevStart, prevEnd)
            ]);

            if (globCur && globPrev) {
              currentGlobal = globCur;
              previousGlobal = globPrev;
            }
          }

          const calcHybrid = (key, primCur, primPrev, globCur, globPrev) => {
            const valC = primCur?.[key] || 0;
            const valP = primPrev?.[key] || 0;

            // Delta from Global
            const gC = globCur?.[key] || 0;
            const gP = globPrev?.[key] || 0;

            const diff = valC - valP; // Value diff (filtered) - debatably useful if % is global, but kept for consistency

            // PCT from Global
            const diffG = gC - gP;
            const diff_pct = gP > 0 ? (diffG / gP) * 100 : (gC > 0 ? 100 : 0);
            const direction = diffG > 0.0001 ? 'up' : diffG < -0.0001 ? 'down' : 'flat';

            return { value: valC, previous: valP, diff, diff_pct, direction };
          };

          total_orders = calcHybrid('total_orders', current, previous, currentGlobal, previousGlobal);
          total_sales = calcHybrid('total_sales', current, previous, currentGlobal, previousGlobal);
          average_order_value = calcHybrid('average_order_value', current, previous, currentGlobal, previousGlobal);
          conversion_rate = calcHybrid('conversion_rate_percent', current, previous, currentGlobal, previousGlobal);
          total_sessions = calcHybrid('total_sessions', current, previous, currentGlobal, previousGlobal);
          total_atc_sessions = calcHybrid('total_atc_sessions', current, previous, currentGlobal, previousGlobal);
        }

        let filterOptions = null;
        if (req.query.include_utm_options === 'true') {
          // Ensure DB connection for filter options, especially if main metrics were cached
          if (!req.brandDb && req.brandConfig) {
            try {
              req.brandDb = await getBrandConnection(req.brandConfig);
            } catch (connErr) {
              console.error("[dashboardSummary] Lazy connection for UTM options failed", connErr);
            }
          }

          if (req.brandDb) {
            const s = Date.now();
            const conn = req.brandDb.sequelize;

            // Dynamic query to support dependent dropdowns source->medium and source->campaign
            let replacements = [start, end];

            // Helper to get Source filter clause
            const getSourceFilter = () => {
              if (filters.utm_source) {
                const vals = Array.isArray(filters.utm_source) ? filters.utm_source : [filters.utm_source];
                if (vals.length > 0) {
                  const placeholders = vals.map(() => '?').join(', ');
                  replacements.push(...vals);
                  return `AND utm_source IN (${placeholders})`;
                }
              }
              return '';
            };

            // 1. Fetch flat Sales Channel options
            const channelSql = `
              SELECT DISTINCT order_app_name AS val 
              FROM shopify_orders 
              WHERE created_date >= ? AND created_date <= ?
                AND order_app_name IS NOT NULL AND order_app_name <> ''
              ORDER BY val
            `;
            const channelRows = await conn.query(channelSql, {
              type: QueryTypes.SELECT,
              replacements: [start, end]
            });

            // 2. Fetch Hierarchical UTM data
            const utmSql = `
              SELECT DISTINCT utm_source, utm_medium, utm_campaign, utm_term, utm_content
              FROM shopify_orders 
              WHERE created_date >= ? AND created_date <= ?
                AND utm_source IS NOT NULL AND utm_source <> ''
              ORDER BY utm_source, utm_medium, utm_campaign, utm_term, utm_content
            `;
            const utmRows = await conn.query(utmSql, {
              type: QueryTypes.SELECT,
              replacements: [start, end]
            });

            // 3. Build UTM Tree
            const utmTree = {};
            for (const row of utmRows) {
              const { utm_source: s, utm_medium: m, utm_campaign: c, utm_term: t, utm_content: ct } = row;
              if (!s) continue;
              if (!utmTree[s]) utmTree[s] = { mediums: {} };
              if (m) {
                if (!utmTree[s].mediums[m]) utmTree[s].mediums[m] = { campaigns: {} };
                if (c) {
                  if (!utmTree[s].mediums[m].campaigns[c]) utmTree[s].mediums[m].campaigns[c] = { terms: [], contents: [] };
                  if (t && !utmTree[s].mediums[m].campaigns[c].terms.includes(t)) {
                    utmTree[s].mediums[m].campaigns[c].terms.push(t);
                  }
                  if (ct && !utmTree[s].mediums[m].campaigns[c].contents.includes(ct)) {
                    utmTree[s].mediums[m].campaigns[c].contents.push(ct);
                  }
                }
              }
            }

            filterOptions = {
              sales_channel: channelRows.map(r => r.val),
              utm_tree: utmTree
            };
            mark('filter_options', s);
          }
        }

        const response = {
          filter_options: filterOptions,
          range: { start, end },
          prev_range: prevStart && prevEnd ? { start: prevStart, end: prevEnd } : null,
          metrics: {
            total_orders,
            total_sales,
            average_order_value,
            conversion_rate,
            total_sessions,
            total_atc_sessions
          },
          sources
        };

        logger.debug(
          `[SUMMARY TRACE] ${brandQuery} ${start}->${end} steps=${spans.map(s => `${s.label}:${s.ms}ms`).join(' | ')} total=${Date.now() - traceStart}ms`
        );

        return res.json(response);
      } catch (e) {
        console.error('[dashboardSummary] Error:', e);
        return res.status(500).json({ error: 'Internal server error', details: e.message });
      }
    }
  };
}

module.exports = { buildMetricsController };