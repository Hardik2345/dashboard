const { RangeSchema } = require("../validation/schemas");
const {
  DEFAULT_TIMEZONE,
  formatIsoDate,
  getTodayInTimezone,
  normalizeTimezone,
} = require("../shared/utils/date");
const { extractFilters } = require("../shared/utils/filters");

function normalizeRangeQuery(query = {}, options = {}) {
  const {
    defaultToToday = false,
    requireBoth = false,
    allowDateAlias = true,
    timezone = DEFAULT_TIMEZONE,
  } = options;
  const resolvedTimezone = normalizeTimezone(timezone);
  const todayStr = defaultToToday
    ? getTodayInTimezone(resolvedTimezone, new Date())
    : formatIsoDate(new Date());
  const dateAlias = allowDateAlias ? query.date : undefined;
  const startInput = query.start || dateAlias || (defaultToToday ? todayStr : undefined);
  const endInput =
    query.end || dateAlias || startInput || (defaultToToday ? todayStr : undefined);

  const parsed = RangeSchema.safeParse({
    start: startInput,
    end: endInput,
  });
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "Invalid date range",
        details: parsed.error.flatten(),
      },
    };
  }

  const { start, end } = parsed.data;
  if (requireBoth && (!start || !end)) {
    return {
      ok: false,
      status: 400,
      body: { error: "Both start and end dates are required" },
    };
  }
  if (start && end && start > end) {
    return {
      ok: false,
      status: 400,
      body: { error: "start must be on or before end" },
    };
  }

  return {
    ok: true,
    data: { start, end },
    timezone: resolvedTimezone,
  };
}

function normalizeMetricRequest(req, options = {}) {
  const timezone = normalizeTimezone(
    req?.tenantRoute?.timezone ||
    req?.brandTimezone ||
    options.timezone ||
    DEFAULT_TIMEZONE,
  );
  const range = normalizeRangeQuery(req.query, { ...options, timezone });
  if (!range.ok) {
    return range;
  }

  const brandKeysRaw = req.query.brand_keys;
  const brandKeys = Array.isArray(brandKeysRaw)
    ? brandKeysRaw
    : brandKeysRaw
      ? [brandKeysRaw]
      : [];

  return {
    ok: true,
    spec: {
      start: range.data.start,
      end: range.data.end,
      align: (req.query.align || "").toString().toLowerCase(),
      aggregate: (req.query.aggregate || "").toString().toLowerCase(),
      compareStart: req.query.compare_start
        ? req.query.compare_start.toString()
        : null,
      compareEnd: req.query.compare_end ? req.query.compare_end.toString() : null,
      filters: extractFilters(req),
      brandKey: req.brandKey,
      brandKeys,
      conn: req.brandDb?.sequelize || null,
      timezone,
    },
  };
}

module.exports = {
  normalizeRangeQuery,
  normalizeMetricRequest,
};
