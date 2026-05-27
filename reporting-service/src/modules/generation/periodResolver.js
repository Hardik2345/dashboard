const { addDays, formatRangeLabel, startOfUtcDay } = require("../../utils/dates");

function startOfWeek(date) {
  const day = startOfUtcDay(date);
  const weekday = day.getUTCDay();
  const daysFromMonday = (weekday + 6) % 7;
  return addDays(day, -daysFromMonday);
}

function endOfDay(date) {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function resolvePeriod(periodConfig = {}, now = new Date()) {
  const type = periodConfig.type || "week";
  let start;
  let end;

  if (type === "week") {
    start = startOfWeek(now);
    end = endOfDay(addDays(start, 6));
  } else if (type === "month") {
    const d = startOfUtcDay(now);
    start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    end = endOfDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
  } else if (type === "quarter") {
    const d = startOfUtcDay(now);
    const quarterStartMonth = Math.floor(d.getUTCMonth() / 3) * 3;
    start = new Date(Date.UTC(d.getUTCFullYear(), quarterStartMonth, 1));
    end = endOfDay(new Date(Date.UTC(d.getUTCFullYear(), quarterStartMonth + 3, 0)));
  } else {
    const days = Number(periodConfig.custom_days || 7);
    end = endOfDay(startOfUtcDay(now));
    start = startOfUtcDay(addDays(end, -(days - 1)));
  }

  const inclusiveDays = Math.round((startOfUtcDay(end).getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const comparisonEnd = endOfDay(addDays(start, -1));
  const comparisonStart = startOfUtcDay(addDays(comparisonEnd, -(inclusiveDays - 1)));

  return {
    start_at: start,
    end_at: end,
    label: formatRangeLabel(start, end),
    timezone: periodConfig.timezone || "Asia/Kolkata",
    comparison_start_at: comparisonStart,
    comparison_end_at: comparisonEnd,
  };
}

module.exports = { resolvePeriod };
