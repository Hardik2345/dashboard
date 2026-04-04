// SQL clause helpers for raw queries.
// Canonical location. Moved from utils/sql.js

function buildWhereClause(start, end) {
  const parts = [];
  const params = [];
  if (start) {
    parts.push("date >= ?");
    params.push(start);
  }
  if (end) {
    parts.push("date <= ?");
    params.push(end);
  }
  const where = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
  return { where, params };
}

module.exports = { buildWhereClause };
