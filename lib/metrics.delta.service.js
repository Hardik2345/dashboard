const { QueryTypes } = require('sequelize');
const { rawSum } = require('./metrics.service');

function parseIsoDate(s) { return new Date(`${s}T00:00:00Z`); }
function formatIsoDate(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}
function daysInclusive(start, end) {
  const ds = parseIsoDate(start).getTime();
  const de = parseIsoDate(end).getTime();
  return Math.floor((de - ds) / 86400000) + 1;
}
function shiftDays(dateStr, delta) {
  const d = parseIsoDate(dateStr);
  d.setUTCDate(d.getUTCDate() + delta);
  return formatIsoDate(d);
}

function previousWindow(start, end) {
  if (!start || !end) return null;
  const n = daysInclusive(start, end);
  const prevEnd = shiftDays(start, -1);
  const prevStart = shiftDays(prevEnd, -(n - 1));
  return { prevStart, prevEnd };
}

function prevDayStr(date) {
  const d = new Date(`${date}T00:00:00Z`);
  const prev = new Date(d.getTime() - 24 * 3600_000);
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}-${String(prev.getUTCDate()).padStart(2, '0')}`;
}

async function sumForDay(column, date, conn) {
  return rawSum(column, { start: date, end: date, conn });
}

async function deltaForSum(column, date, conn) {
  if (!date) return { current: 0, previous: 0, diff_pct: 0, direction: 'flat' };
  const prev = prevDayStr(date);
  const [curr, prevVal] = await Promise.all([
    sumForDay(column, date, conn),
    sumForDay(column, prev, conn),
  ]);
  const diff = curr - prevVal;
  const diff_pct = prevVal > 0 ? (diff / prevVal) * 100 : (curr > 0 ? 100 : 0);
  const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
  return { current: curr, previous: prevVal, diff_pct, direction };
}

async function aovForRange({ start, end, conn }) {
  // AOV will be computed via totals across the range
  const total_sales = await rawSum('total_sales', { start, end, conn });
  const total_orders = await rawSum('total_orders', { start, end, conn });
  return total_orders > 0 ? total_sales / total_orders : 0;
}

async function cvrForRange({ start, end, conn }) {
  const total_orders = await rawSum('total_orders', { start, end, conn });
  const total_sessions = await rawSum('total_sessions', { start, end, conn });
  const cvr = total_sessions > 0 ? total_orders / total_sessions : 0;
  return { cvr, cvr_percent: cvr * 100 };
}

async function aovForDay(date, conn) {
  const total_sales = await rawSum('total_sales', { start: date, end: date, conn });
  const total_orders = await rawSum('total_orders', { start: date, end: date, conn });
  return total_orders > 0 ? total_sales / total_orders : 0;
}

async function deltaForAOV(date, conn) {
  if (!date) return { current: 0, previous: 0, diff_pct: 0, direction: 'flat' };
  const prev = prevDayStr(date);
  const [curr, prevVal] = await Promise.all([
    aovForDay(date, conn),
    aovForDay(prev, conn),
  ]);
  const diff = curr - prevVal;
  const diff_pct = prevVal > 0 ? (diff / prevVal) * 100 : (curr > 0 ? 100 : 0);
  const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
  return { current: curr, previous: prevVal, diff_pct, direction };
}

function istNowInfo() {
  const IST_OFFSET_MIN = 330;
  const nowUtc = new Date();
  const nowIst = new Date(nowUtc.getTime() + IST_OFFSET_MIN * 60 * 1000);
  const yyyy = nowIst.getUTCFullYear();
  const mm = String(nowIst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(nowIst.getUTCDate()).padStart(2, '0');
  const todayIst = `${yyyy}-${mm}-${dd}`;
  const currentHourIst = nowIst.getUTCHours();
  return { todayIst, currentHourIst, IST_OFFSET_MIN };
}

async function alignedSalesForRange({ start, end, conn, targetHour }) {
  const sqlRange = `SELECT COALESCE(SUM(total_sales),0) AS total FROM hour_wise_sales WHERE date >= ? AND date <= ? AND hour <= ?`;
  const rows = await conn.query(sqlRange, { type: QueryTypes.SELECT, replacements: [start, end, targetHour] });
  return Number(rows?.[0]?.total || 0);
}

async function alignedSalesForDay({ date, conn, targetHour }) {
  const sql = `SELECT COALESCE(SUM(total_sales),0) AS total FROM hour_wise_sales WHERE date = ? AND hour <= ?`;
  const rows = await conn.query(sql, { type: QueryTypes.SELECT, replacements: [date, targetHour] });
  return Number(rows?.[0]?.total || 0);
}

async function alignedSessionsForRange({ start, end, conn, targetHour }) {
  const sqlRange = `SELECT COALESCE(SUM(number_of_sessions),0) AS total FROM hourly_sessions_summary WHERE date >= ? AND date <= ? AND hour <= ?`;
  const rows = await conn.query(sqlRange, { type: QueryTypes.SELECT, replacements: [start, end, targetHour] });
  return Number(rows?.[0]?.total || 0);
}

async function alignedSessionsForDay({ date, conn, targetHour }) {
  const sql = `SELECT COALESCE(SUM(number_of_sessions),0) AS total FROM hourly_sessions_summary WHERE date = ? AND hour <= ?`;
  const rows = await conn.query(sql, { type: QueryTypes.SELECT, replacements: [date, targetHour] });
  return Number(rows?.[0]?.total || 0);
}

async function alignedATCForRange({ start, end, conn, targetHour }) {
  const sqlRange = `SELECT COALESCE(SUM(number_of_atc_sessions),0) AS total FROM hourly_sessions_summary WHERE date >= ? AND date <= ? AND hour <= ?`;
  const rows = await conn.query(sqlRange, { type: QueryTypes.SELECT, replacements: [start, end, targetHour] });
  return Number(rows?.[0]?.total || 0);
}

async function alignedATCForDay({ date, conn, targetHour }) {
  const sql = `SELECT COALESCE(SUM(number_of_atc_sessions),0) AS total FROM hourly_sessions_summary WHERE date = ? AND hour <= ?`;
  const rows = await conn.query(sql, { type: QueryTypes.SELECT, replacements: [date, targetHour] });
  return Number(rows?.[0]?.total || 0);
}

function istRangeUtcBounds(s, e, IST_OFFSET_MIN) {
  const y1 = Number(s.slice(0,4));
  const m1 = Number(s.slice(5,7));
  const d1 = Number(s.slice(8,10));
  const y2 = Number(e.slice(0,4));
  const m2 = Number(e.slice(5,7));
  const d2 = Number(e.slice(8,10));
  const offsetMs = IST_OFFSET_MIN * 60 * 1000;
  const startUtcMs = Date.UTC(y1, m1 - 1, d1, 0, 0, 0) - offsetMs; // IST midnight -> UTC
  const endUtcMs = Date.UTC(y2, m2 - 1, d2 + 1, 0, 0, 0) - offsetMs; // end date + 1 day IST midnight -> UTC
  const startStr = new Date(startUtcMs).toISOString().slice(0,19).replace('T',' ');
  const endStr = new Date(endUtcMs).toISOString().slice(0,19).replace('T',' ');
  return { startStr, endStr };
}

function buildIstWindow(dateStr, hour, IST_OFFSET_MIN) {
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(5, 7));
  const d0 = Number(dateStr.slice(8, 10));
  const offsetMs = IST_OFFSET_MIN * 60 * 1000;
  const startUtcMs = Date.UTC(y, m - 1, d0, 0, 0, 0) - offsetMs; // IST midnight -> UTC
  const endUtcMs = startUtcMs + (hour + 1) * 3600_000; // exclusive end at next hour
  const startStr = new Date(startUtcMs).toISOString().slice(0,19).replace('T',' ');
  const endStr = new Date(endUtcMs).toISOString().slice(0,19).replace('T',' ');
  return { startStr, endStr };
}

async function alignedOrdersForRange({ start, end, conn, targetHour, IST_OFFSET_MIN }) {
  const { startStr, endStr } = istRangeUtcBounds(start, end, IST_OFFSET_MIN);
  const sql = `
    SELECT COALESCE(SUM(cnt),0) AS total FROM (
      SELECT DATE(CONVERT_TZ(created_at, '+00:00', '+05:30')) AS d,
             HOUR(CONVERT_TZ(created_at, '+00:00', '+05:30')) AS h,
             COUNT(DISTINCT order_name) AS cnt
      FROM shopify_orders
      WHERE created_at >= ? AND created_at < ?
      GROUP BY d, h
    ) t
    WHERE h <= ? AND d >= ? AND d <= ?`;
  const rows = await conn.query(sql, { type: QueryTypes.SELECT, replacements: [startStr, endStr, targetHour, start, end] });
  return Number(rows?.[0]?.total || 0);
}

async function alignedOrdersForDay({ date, conn, targetHour, IST_OFFSET_MIN }) {
  const { startStr, endStr } = buildIstWindow(date, targetHour, IST_OFFSET_MIN);
  const sql = `SELECT COUNT(DISTINCT order_name) AS cnt FROM shopify_orders WHERE created_at >= ? AND created_at < ?`;
  const rows = await conn.query(sql, { type: QueryTypes.SELECT, replacements: [startStr, endStr] });
  return Number(rows?.[0]?.cnt || 0);
}

module.exports = {
  previousWindow,
  prevDayStr,
  deltaForSum,
  deltaForAOV,
  aovForRange,
  cvrForRange,
  istNowInfo,
  alignedSalesForRange,
  alignedSalesForDay,
  alignedSessionsForRange,
  alignedSessionsForDay,
  alignedATCForRange,
  alignedATCForDay,
  alignedOrdersForRange,
  alignedOrdersForDay,
};
