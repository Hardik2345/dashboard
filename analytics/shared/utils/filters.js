// UTM, device-type, and request filter helpers.
// Canonical location. Extracted from utils/metricsUtils.js

const { daysInclusive } = require("./date");

// ── Internal helpers ───────────────────────────────────────────────────────────

function normalizeFilterValues(val) {
  if (!val) return [];
  const vals = Array.isArray(val)
    ? val
    : typeof val === "string" && val.includes(",")
      ? val.split(",")
      : [val];
  return vals
    .map((v) => (typeof v === "string" ? v.trim() : String(v).trim()))
    .filter(Boolean);
}

function extractUtmParam(val) {
  if (!val) return null;
  if (Array.isArray(val)) return val.filter((v) => v);
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed.includes(","))
      return trimmed
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    return trimmed || null;
  }
  return null;
}

// ── Clause builders ────────────────────────────────────────────────────────────

function buildDeviceTypeUserAgentClause(deviceType, column = "user_agent") {
  if (!deviceType) return null;
  const types = Array.isArray(deviceType) ? deviceType : [deviceType];
  if (types.length === 0) return null;

  const clauses = [];
  for (const t of types) {
    const lower = (t || "").toString().toLowerCase().trim();
    if (lower === "desktop") {
      clauses.push(`${column} LIKE '%Windows%'`);
    } else if (lower === "mobile") {
      clauses.push(`(${column} LIKE '%Android%' OR ${column} LIKE '%iPhone%')`);
    } else if (lower === "others") {
      clauses.push(
        `(${column} NOT LIKE '%Windows%' AND ${column} NOT LIKE '%Android%' AND ${column} NOT LIKE '%iPhone%')`,
      );
    }
  }
  if (clauses.length === 0) return null;
  return clauses.join(" OR ");
}

function buildUtmWhereClause(
  filters,
  {
    mapDirectToNull = false,
    prefixWithAnd = false,
    deviceColumn = "user_agent",
  } = {},
) {
  if (!filters) {
    return { clause: "", params: [] };
  }

  const clauses = [];
  const params = [];

  const append = (col, val) => {
    const cleanVals = normalizeFilterValues(val);
    if (cleanVals.length === 0) return;

    if (mapDirectToNull && col === "utm_source") {
      const hasDirect = cleanVals.some((v) => v.toLowerCase() === "direct");
      const otherVals = cleanVals.filter((v) => v.toLowerCase() !== "direct");
      if (hasDirect) {
        if (otherVals.length === 0) {
          clauses.push(`${col} IS NULL`);
        } else {
          clauses.push(
            `(${col} IN (${otherVals.map(() => "?").join(", ")}) OR ${col} IS NULL)`,
          );
          params.push(...otherVals);
        }
        return;
      }
    }

    if (cleanVals.length === 1) {
      clauses.push(`${col} = ?`);
      params.push(cleanVals[0]);
    } else {
      clauses.push(`${col} IN (${cleanVals.map(() => "?").join(", ")})`);
      params.push(...cleanVals);
    }
  };

  append("utm_source", filters.utm_source);
  append("utm_medium", filters.utm_medium);
  append("utm_campaign", filters.utm_campaign);
  append("utm_term", filters.utm_term);
  append("utm_content", filters.utm_content);
  append("order_app_name", filters.sales_channel);

  const dtClause = buildDeviceTypeUserAgentClause(filters.device_type, deviceColumn);
  if (dtClause) {
    clauses.push(`(${dtClause})`);
  }

  if (clauses.length === 0) {
    return { clause: "", params };
  }

  return {
    clause: `${prefixWithAnd ? " AND " : ""}${clauses.join(" AND ")}`,
    params,
  };
}

function appendUtmWhere(sql, params, filters, mapDirectToNull = false) {
  const built = buildUtmWhereClause(filters, { mapDirectToNull, prefixWithAnd: true });
  params.push(...built.params);
  return `${sql}${built.clause}`;
}

function hasUtmFilters(filters) {
  if (!filters) return false;
  return !!(
    filters.utm_source ||
    filters.utm_medium ||
    filters.utm_campaign ||
    filters.utm_term ||
    filters.utm_content ||
    filters.sales_channel ||
    filters.device_type
  );
}

// ── Request-level filter extractor ────────────────────────────────────────────

function extractFilters(req) {
  const {
    start,
    end,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_term,
    utm_content,
    sales_channel,
    device_type,
    product_id,
  } = req.query;

  // Suppress UTM filters for date ranges exceeding 30 days to prevent heavy queries.
  const ignoreUtms = start && end && daysInclusive(start, end) > 30;

  return {
    utm_source: ignoreUtms ? null : extractUtmParam(utm_source),
    utm_medium: ignoreUtms ? null : extractUtmParam(utm_medium),
    utm_campaign: ignoreUtms ? null : extractUtmParam(utm_campaign),
    utm_term: ignoreUtms ? null : extractUtmParam(utm_term),
    utm_content: ignoreUtms ? null : extractUtmParam(utm_content),
    sales_channel: extractUtmParam(sales_channel),
    device_type: extractUtmParam(device_type),
    product_id: extractUtmParam(product_id),
  };
}

module.exports = {
  buildUtmWhereClause,
  appendUtmWhere,
  buildDeviceTypeUserAgentClause,
  hasUtmFilters,
  extractUtmParam,
  extractFilters,
};
