const {
  normalizeRangeQuery,
  normalizeMetricRequest,
} = require('../../services/metricsRequestNormalizer');
const { DEFAULT_TIMEZONE, normalizeTimezone } = require('../../shared/utils/date');

function resolveRequestTimezone(reqOrOptions = {}, maybeOptions = {}) {
  if (reqOrOptions?.tenantRoute || reqOrOptions?.brandTimezone) {
    return normalizeTimezone(
      reqOrOptions?.tenantRoute?.timezone ||
      reqOrOptions?.brandTimezone ||
      maybeOptions.timezone ||
      DEFAULT_TIMEZONE,
    );
  }
  return normalizeTimezone(reqOrOptions.timezone || DEFAULT_TIMEZONE);
}

function parseRangeQuery(query = {}, { defaultToToday = false, timezone = DEFAULT_TIMEZONE } = {}) {
  return normalizeRangeQuery(query, { defaultToToday, allowDateAlias: false, timezone });
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
  resolveRequestTimezone,
};
