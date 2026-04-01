const { RangeSchema } = require("../validation/schemas");
const { formatIsoDate } = require("../utils/dateUtils");
const { extractFilters } = require("../utils/metricsUtils");

function normalizeRangeQuery(query = {}, options = {}) {
  const {
    defaultToToday = false,
    requireBoth = false,
    allowDateAlias = true,
  } = options;
  const todayStr = formatIsoDate(new Date());
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
  };
}

function normalizeMetricRequest(req, options = {}) {
  const range = normalizeRangeQuery(req.query, options);
  if (!range.ok) {
    return range;
  }

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
      conn: req.brandDb?.sequelize || null,
    },
  };
}

module.exports = {
  normalizeRangeQuery,
  normalizeMetricRequest,
};
