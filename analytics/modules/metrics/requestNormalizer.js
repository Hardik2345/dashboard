const {
  normalizeRangeQuery,
  normalizeMetricRequest,
} = require('../../services/metricsRequestNormalizer');

function parseRangeQuery(query = {}, { defaultToToday = false } = {}) {
  return normalizeRangeQuery(query, { defaultToToday, allowDateAlias: false });
}

function ensureBrandSequelize(req, errorMessage = 'Brand DB connection unavailable') {
  const conn = req?.brandDb?.sequelize || null;
  if (!conn) {
    return { ok: false, status: 500, body: { error: errorMessage } };
  }
  return { ok: true, conn };
}

module.exports = {
  normalizeRangeQuery,
  normalizeMetricRequest,
  parseRangeQuery,
  ensureBrandSequelize,
};
