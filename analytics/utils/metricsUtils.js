const { QueryTypes } = require("sequelize");
const { buildWhereClause } = require("./sql");
const { daysInclusive } = require("./dateUtils");

// raw SUM helper to avoid ORM coercion issues
async function rawSum(column, { start, end, conn }) {
  const { where, params } = buildWhereClause(start, end);
  let selectExpr = column;
  if (column === "total_sessions") {
    selectExpr = "COALESCE(adjusted_total_sessions, total_sessions)";
  }
  const sql = `SELECT COALESCE(SUM(${selectExpr}), 0) AS total FROM overall_summary ${where}`;
  const rows = await conn.query(sql, {
    type: QueryTypes.SELECT,
    replacements: params,
  });
  return Number(rows[0]?.total || 0);
}

async function computeReturnCounts({ start, end, conn, filters }) {
  if (hasUtmFilters(filters)) {
    let sql = `
      SELECT 
        SUM(CASE WHEN rf.event_type = 'CANCEL' THEN 1 ELSE 0 END) AS cancelled_orders,
        SUM(CASE WHEN rf.event_type = 'REFUND' THEN 1 ELSE 0 END) AS refunded_orders
      FROM returns_fact rf
      JOIN shopify_orders so ON rf.order_id = so.order_id
    `;
    const parts = [];
    const params = [];
    if (start) {
      parts.push("rf.event_date >= ?");
      params.push(start);
    }
    if (end) {
      parts.push("rf.event_date <= ?");
      params.push(end);
    }
    if (filters) {
      const built = buildUtmWhereClause(filters, {
        deviceColumn: "so.user_agent",
      });
      if (built.clause) {
        parts.push(built.clause);
        params.push(...built.params);
      }
    }
    const where = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
    sql += ` ${where}`;
    const rows = await conn.query(sql, {
      type: QueryTypes.SELECT,
      replacements: params,
    });
    return {
      cancelled_orders: Number(rows[0]?.cancelled_orders || 0),
      refunded_orders: Number(rows[0]?.refunded_orders || 0),
    };
  } else {
    let sql = `
      SELECT 
        SUM(CASE WHEN event_type = 'CANCEL' THEN 1 ELSE 0 END) AS cancelled_orders,
        SUM(CASE WHEN event_type = 'REFUND' THEN 1 ELSE 0 END) AS refunded_orders
      FROM returns_fact
    `;
    const parts = [];
    const params = [];
    if (start) {
      parts.push("event_date >= ?");
      params.push(start);
    }
    if (end) {
      parts.push("event_date <= ?");
      params.push(end);
    }
    const where = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
    sql += ` ${where}`;
    const rows = await conn.query(sql, {
      type: QueryTypes.SELECT,
      replacements: params,
    });
    return {
      cancelled_orders: Number(rows[0]?.cancelled_orders || 0),
      refunded_orders: Number(rows[0]?.refunded_orders || 0),
    };
  }
}

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

  const dtClause = buildDeviceTypeUserAgentClause(
    filters.device_type,
    deviceColumn,
  );
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
  const built = buildUtmWhereClause(filters, {
    mapDirectToNull,
    prefixWithAnd: true,
  });
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

function computePercentDelta(currentValue, previousValue) {
  const curr = Number(currentValue || 0);
  const prev = Number(previousValue || 0);
  const diff_pp = curr - prev;
  const diff_pct = prev > 0 ? (diff_pp / prev) * 100 : curr > 0 ? 100 : 0;
  const direction =
    diff_pp > 0.0001 ? "up" : diff_pp < -0.0001 ? "down" : "flat";
  return { diff_pp, diff_pct, direction };
}

/**
 * Build a SQL clause for device_type filter on user_agent column.
 * @param {string|string[]|null} deviceType - e.g. ['Desktop','Mobile'] or 'Desktop'
 * @returns {string|null} SQL snippet like "(user_agent LIKE '%Windows%')" or null
 */
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
      clauses.push(
        `(${column} LIKE '%Android%' OR ${column} LIKE '%iPhone%')`,
      );
    } else if (lower === "others") {
      clauses.push(
        `(${column} NOT LIKE '%Windows%' AND ${column} NOT LIKE '%Android%' AND ${column} NOT LIKE '%iPhone%')`,
      );
    }
  }
  if (clauses.length === 0) return null;
  return clauses.join(" OR ");
}

module.exports = {
  rawSum,
  computeReturnCounts,
  computePercentDelta,
  hasUtmFilters,
  buildUtmWhereClause,
  appendUtmWhere,
  extractUtmParam,
  buildDeviceTypeUserAgentClause,
  extractFilters,
};

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

/**
 * Extracts filters from the request query.
 * If the date range (start to end) exceeds 30 days, UTM parameters are ignored
 * to prevent heavy queries from timing out the database.
 */
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

  let ignoreUtms = false;
  if (start && end) {
    const numDays = daysInclusive(start, end);
    if (numDays > 30) {
      ignoreUtms = true;
    }
  }

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
