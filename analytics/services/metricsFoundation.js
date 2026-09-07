const {
  IST_OFFSET_MIN,
  DEFAULT_TIMEZONE,
  DAY_MS,
  pad2,
  formatUtcDate,
  getNowIst,
  getTodayIst,
  isTodayUtc,
  secondsToTime,
  parseHourFromCutoff,
  getIstContext,
  normalizeTimezone,
  getTimezoneContext,
  getTodayInTimezone,
  getNowInTimezone,
  shiftDays,
  previousWindow,
} = require("../shared/utils/date");

function resolveCompareRange(start, end, compareStart, compareEnd) {
  if (compareStart && compareEnd) {
    return { start: compareStart, end: compareEnd };
  }
  const previous = previousWindow(start, end);
  return previous
    ? { start: previous.prevStart, end: previous.prevEnd }
    : null;
}

function buildLiveCutoffContext(start, end, now = new Date(), timezone = DEFAULT_TIMEZONE) {
  const ctx = getTimezoneContext(now, timezone);
  const includesToday = !!start && !!end && start <= ctx.today && end >= ctx.today;
  if (!includesToday) {
    return {
      includesToday: false,
      cutoffTime: null,
      cutoffHour: 23,
      today: ctx.today,
      nowLocal: ctx.nowLocal,
      timezone: ctx.timezone,
      todayIst: ctx.today,
      nowIst: ctx.nowLocal,
    };
  }

  const fullDaySeconds = 24 * 3600;
  const effectiveSeconds = Math.min(fullDaySeconds, Math.max(0, ctx.secondsNow));
  const cutoffTime =
    effectiveSeconds >= fullDaySeconds
      ? "24:00:00"
      : secondsToTime(effectiveSeconds);

  return {
    includesToday: true,
    cutoffTime,
    cutoffHour: parseHourFromCutoff(cutoffTime),
    today: ctx.today,
    nowLocal: ctx.nowLocal,
    timezone: ctx.timezone,
    todayIst: ctx.today,
    nowIst: ctx.nowLocal,
  };
}

function buildCompletedHourCutoffContext(start, end, now = new Date(), timezone = DEFAULT_TIMEZONE) {
  const ctx = getTimezoneContext(now, timezone);
  const rangeStart = start || end;
  const rangeEnd = end || start;
  const currentRangeIncludesToday =
    !!rangeStart &&
    !!rangeEnd &&
    rangeStart <= ctx.today &&
    rangeEnd >= ctx.today;
  const currentHour = ctx.currentHour;
  const currentMinute = ctx.currentMinute;
  const currentSecond = ctx.currentSecond;

  return {
    currentRangeIncludesToday,
    cutoffHour: currentRangeIncludesToday ? currentHour - 1 : 23,
    orderCutoffTime: currentRangeIncludesToday
      ? `${pad2(currentHour)}:${pad2(currentMinute)}:${pad2(currentSecond)}`
      : "24:00:00",
    today: ctx.today,
    nowLocal: ctx.nowLocal,
    timezone: ctx.timezone,
    todayIst: ctx.today,
    nowIst: ctx.nowLocal,
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
  DEFAULT_TIMEZONE,
  DAY_MS,
  pad2,
  formatUtcDate,
  getNowIst,
  getTodayIst,
  isTodayUtc,
  secondsToTime,
  parseHourFromCutoff,
  getIstContext,
  normalizeTimezone,
  getTimezoneContext,
  getTodayInTimezone,
  getNowInTimezone,
  shiftDays,
  resolveCompareRange,
  buildLiveCutoffContext,
  buildCompletedHourCutoffContext,
  buildCompletedHourOrderCutoffTime,
  buildRowTwoComparisonCutoffs,
};
