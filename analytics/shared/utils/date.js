// Canonical date utilities.
// Merges: utils/dateUtils.js + the date/time helpers formerly in services/metricsFoundation.js

// ── Timezone constants ────────────────────────────────────────────────────────

const DEFAULT_TIMEZONE = "Asia/Kolkata";
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

// ── Timezone context helpers ───────────────────────────────────────────────────

function normalizeTimezone(timezone, fallback = DEFAULT_TIMEZONE) {
  const candidate = (timezone || "").toString().trim() || fallback;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date(0));
    return candidate;
  } catch {
    return fallback;
  }
}

function getTimezoneParts(now = new Date(), timezone = DEFAULT_TIMEZONE) {
  const resolvedTimezone = normalizeTimezone(timezone);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: resolvedTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = {};
  for (const part of formatter.formatToParts(now)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return {
    timezone: resolvedTimezone,
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

function getTimezoneContext(now = new Date(), timezone = DEFAULT_TIMEZONE) {
  const parts = getTimezoneParts(now, timezone);
  return {
    timezone: parts.timezone,
    nowLocal: new Date(Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    )),
    today: parts.date,
    currentHour: parts.hour,
    currentMinute: parts.minute,
    currentSecond: parts.second,
    secondsNow: parts.hour * 3600 + parts.minute * 60 + parts.second,
  };
}

function getTodayInTimezone(timezone = DEFAULT_TIMEZONE, now = new Date()) {
  return getTimezoneContext(now, timezone).today;
}

function getNowInTimezone(timezone = DEFAULT_TIMEZONE, now = new Date()) {
  return getTimezoneContext(now, timezone).nowLocal;
}

function previousDateInTimezone(timezone = DEFAULT_TIMEZONE, now = new Date()) {
  return shiftDays(getTodayInTimezone(timezone, now), -1);
}

function getTimezoneLabel(timezone = DEFAULT_TIMEZONE) {
  return normalizeTimezone(timezone);
}

// ── IST compatibility helpers ─────────────────────────────────────────────────

function getNowIst(now = new Date()) {
  return getNowInTimezone(DEFAULT_TIMEZONE, now);
}

function getTodayIst(now = new Date()) {
  return getTodayInTimezone(DEFAULT_TIMEZONE, now);
}

function isTodayUtc(dateStr, now = new Date()) {
  if (!dateStr) return false;
  return dateStr === formatUtcDate(now);
}

function getIstContext(now = new Date()) {
  const ctx = getTimezoneContext(now, DEFAULT_TIMEZONE);
  return {
    nowIst: ctx.nowLocal,
    todayIst: ctx.today,
    secondsNow: ctx.secondsNow,
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
  DEFAULT_TIMEZONE,
  IST_OFFSET_MIN,
  DAY_MS,
  pad2,
  formatUtcDate,
  formatIsoDate,
  parseIsoDate,
  secondsToTime,
  parseHourFromCutoff,
  normalizeTimezone,
  getTimezoneParts,
  getTimezoneContext,
  getTodayInTimezone,
  getNowInTimezone,
  previousDateInTimezone,
  getTimezoneLabel,
  getNowIst,
  getTodayIst,
  isTodayUtc,
  getIstContext,
  daysInclusive,
  shiftDays,
  previousWindow,
  prevDayStr,
};
