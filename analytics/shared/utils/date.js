// Canonical date utilities.
// Merges: utils/dateUtils.js + the date/time helpers formerly in services/metricsFoundation.js

// ── IST constants ─────────────────────────────────────────────────────────────

const IST_OFFSET_MIN = 330;
const DAY_MS = 24 * 3600_000;

// ── Primitive formatters ───────────────────────────────────────────────────────

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatUtcDate(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

// Alias kept for callers that imported formatIsoDate from dateUtils
function formatIsoDate(date) {
  return formatUtcDate(date);
}

function parseIsoDate(s) {
  return new Date(`${s}T00:00:00Z`);
}

function secondsToTime(seconds) {
  const hh = Math.floor(seconds / 3600);
  const mm = Math.floor((seconds % 3600) / 60);
  const ss = seconds % 60;
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}

function parseHourFromCutoff(cutoffTime) {
  if (!cutoffTime) return 23;
  const hour = Number.parseInt(String(cutoffTime).split(":")[0], 10);
  if (!Number.isFinite(hour)) return 23;
  return Math.max(0, Math.min(23, hour));
}

// ── IST context helpers ────────────────────────────────────────────────────────

function getNowIst(now = new Date()) {
  return new Date(now.getTime() + IST_OFFSET_MIN * 60 * 1000);
}

function getTodayIst(now = new Date()) {
  return formatUtcDate(getNowIst(now));
}

function isTodayUtc(dateStr, now = new Date()) {
  if (!dateStr) return false;
  return dateStr === formatUtcDate(now);
}

function getIstContext(now = new Date()) {
  const nowIst = getNowIst(now);
  return {
    nowIst,
    todayIst: formatUtcDate(nowIst),
    secondsNow:
      nowIst.getUTCHours() * 3600 +
      nowIst.getUTCMinutes() * 60 +
      nowIst.getUTCSeconds(),
  };
}

// ── Date range helpers ─────────────────────────────────────────────────────────

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
  return formatIsoDate(prev);
}

module.exports = {
  IST_OFFSET_MIN,
  DAY_MS,
  pad2,
  formatUtcDate,
  formatIsoDate,
  parseIsoDate,
  secondsToTime,
  parseHourFromCutoff,
  getNowIst,
  getTodayIst,
  isTodayUtc,
  getIstContext,
  daysInclusive,
  shiftDays,
  previousWindow,
  prevDayStr,
};
