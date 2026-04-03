const { previousWindow } = require("../utils/dateUtils");

const IST_OFFSET_MIN = 330;
const DAY_MS = 24 * 3600_000;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatUtcDate(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

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

function resolveCompareRange(start, end, compareStart, compareEnd) {
  if (compareStart && compareEnd) {
    return { start: compareStart, end: compareEnd };
  }
  const previous = previousWindow(start, end);
  return previous
    ? { start: previous.prevStart, end: previous.prevEnd }
    : null;
}

function buildLiveCutoffContext(start, end, now = new Date()) {
  const { nowIst, todayIst, secondsNow } = getIstContext(now);
  const includesToday = !!start && !!end && start <= todayIst && end >= todayIst;
  if (!includesToday) {
    return {
      includesToday: false,
      cutoffTime: null,
      cutoffHour: 23,
      todayIst,
      nowIst,
    };
  }

  const fullDaySeconds = 24 * 3600;
  const effectiveSeconds = Math.min(fullDaySeconds, Math.max(0, secondsNow));
  const cutoffTime =
    effectiveSeconds >= fullDaySeconds
      ? "24:00:00"
      : secondsToTime(effectiveSeconds);

  return {
    includesToday: true,
    cutoffTime,
    cutoffHour: parseHourFromCutoff(cutoffTime),
    todayIst,
    nowIst,
  };
}

function buildCompletedHourCutoffContext(start, end, now = new Date()) {
  const { nowIst, todayIst } = getIstContext(now);
  const rangeStart = start || end;
  const rangeEnd = end || start;
  const currentRangeIncludesToday =
    !!rangeStart &&
    !!rangeEnd &&
    rangeStart <= todayIst &&
    rangeEnd >= todayIst;
  const currentHour = nowIst.getUTCHours();
  const currentMinute = nowIst.getUTCMinutes();
  const currentSecond = nowIst.getUTCSeconds();

  return {
    currentRangeIncludesToday,
    cutoffHour: currentRangeIncludesToday ? currentHour - 1 : 23,
    orderCutoffTime: currentRangeIncludesToday
      ? `${pad2(currentHour)}:${pad2(currentMinute)}:${pad2(currentSecond)}`
      : "24:00:00",
    todayIst,
    nowIst,
  };
}

function buildCompletedHourOrderCutoffTime(cutoffHour) {
  const nextHour = Math.min(24, Number.isInteger(cutoffHour) ? cutoffHour + 1 : 24);
  return nextHour >= 24 ? "24:00:00" : `${pad2(nextHour)}:00:00`;
}

function buildRowTwoComparisonCutoffs(cutoffCtx) {
  const currentCutoffHour = cutoffCtx.cutoffHour;
  const nextHourCutoffTime = buildCompletedHourOrderCutoffTime(currentCutoffHour);
  return {
    currentCutoffHour,
    previousSessionCutoffHour: currentCutoffHour,
    currentOrderCutoffTime: nextHourCutoffTime,
    previousOrderCutoffTime: nextHourCutoffTime,
  };
}

module.exports = {
  IST_OFFSET_MIN,
  DAY_MS,
  pad2,
  formatUtcDate,
  getNowIst,
  getTodayIst,
  isTodayUtc,
  secondsToTime,
  parseHourFromCutoff,
  getIstContext,
  resolveCompareRange,
  buildLiveCutoffContext,
  buildCompletedHourCutoffContext,
  buildCompletedHourOrderCutoffTime,
  buildRowTwoComparisonCutoffs,
};
