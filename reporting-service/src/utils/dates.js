const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfUtcDay(date) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(date, days) {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatRangeLabel(startAt, endAt) {
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${fmt.format(new Date(startAt))} - ${fmt.format(new Date(endAt))}`;
}

module.exports = { MS_PER_DAY, startOfUtcDay, addDays, isoDate, formatRangeLabel };
