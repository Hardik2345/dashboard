// Date and range helpers shared across controllers/services.
function parseIsoDate(s) {
  return new Date(`${s}T00:00:00Z`);
}

function formatIsoDate(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
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

module.exports = {
  parseIsoDate,
  formatIsoDate,
  daysInclusive,
  shiftDays,
  previousWindow,
  prevDayStr,
  getComparisonRange,
};

function getComparisonRange(start, end, mode) {
  if (!start || !end) return null;
  const m = (mode || '').toLowerCase();

  if (m === 'last_week' || m === 'week_over_week' || m === 'wow') {
    // Shift both start and end back by 7 days
    const pStart = shiftDays(start, -7);
    const pEnd = shiftDays(end, -7);
    return { prevStart: pStart, prevEnd: pEnd };
  }

  // Default: previous window (contiguous)
  return previousWindow(start, end);
}
