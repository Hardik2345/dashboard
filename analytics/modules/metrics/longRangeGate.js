const DEFAULT_RESTRICT_DATA = true;
const DEFAULT_DATA_RESTRICTION_PERIOD = 30;

function parseBooleanEnv(value, fallback = DEFAULT_RESTRICT_DATA) {
  if (value == null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

function parsePeriodEnv(value, fallback = DEFAULT_DATA_RESTRICTION_PERIOD) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getDataRestrictionConfig() {
  return {
    enabled: parseBooleanEnv(process.env.RESTRICT_DATA, DEFAULT_RESTRICT_DATA),
    periodDays: parsePeriodEnv(
      process.env.DATA_RESTRICTION_PERIOD,
      DEFAULT_DATA_RESTRICTION_PERIOD,
    ),
  };
}

function isRangeOverDataRestrictionPeriod(start, end) {
  const config = getDataRestrictionConfig();
  if (!config.enabled) return false;
  if (!start || !end) return false;
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return false;
  }
  const dayCount =
    Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  return dayCount > config.periodDays;
}

function buildLongRangeUnavailablePayload(extra = {}) {
  const config = getDataRestrictionConfig();
  return {
    unavailable: true,
    reason: "range_over_data_restriction_period",
    message: `Unavailable for date ranges over ${config.periodDays} days.`,
    restriction: config,
    ...extra,
  };
}

module.exports = {
  DEFAULT_RESTRICT_DATA,
  DEFAULT_DATA_RESTRICTION_PERIOD,
  getDataRestrictionConfig,
  isRangeOverDataRestrictionPeriod,
  buildLongRangeUnavailablePayload,
};
