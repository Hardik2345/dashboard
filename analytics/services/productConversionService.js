const { QueryTypes } = require("sequelize");
const { buildIstCutoffContext } = require("./metricsReportService");
const { normalizeRangeQuery } = require("./metricsRequestNormalizer");

const ALLOWED_SORT = new Map([
  ["sessions", "sessions"],
  ["atc", "atc"],
  ["atc_rate", "atc_rate"],
  ["orders", "orders"],
  ["sales", "sales"],
  ["cvr", "cvr"],
  ["landing_page_path", "landing_page_path"],
]);

const VALID_FILTER_FIELDS = new Set([
  "sessions",
  "atc",
  "atc_rate",
  "orders",
  "sales",
  "cvr",
]);

const CSV_HEADERS = [
  "landing_page_path",
  "sessions",
  "atc",
  "atc_rate",
  "orders",
  "sales",
  "cvr",
];

const PREVIOUS_HEADER_MAP = {
  sessions: "prev_sessions",
  atc: "prev_atc",
  atc_rate: "prev_atc_rate",
  orders: "prev_orders",
  sales: "prev_sales",
  cvr: "prev_cvr",
};

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeRequestFilters(query) {
  let filters = parseJsonArray(query.filters);
  const singleField = (query.filter_field || "").toString().toLowerCase();
  if (filters.length === 0 && singleField) {
    filters = [
      {
        field: singleField,
        operator: (query.filter_operator || "").toString().toLowerCase(),
        value: query.filter_value,
      },
    ];
  }
  return filters;
}

function buildMetricFilterExpression(field) {
  switch (field) {
    case "sessions":
      return "s.sessions";
    case "atc":
      return "s.atc";
    case "atc_rate":
      return "(CASE WHEN s.sessions > 0 THEN s.atc / s.sessions * 100 ELSE 0 END)";
    case "orders":
      return "COALESCE(o.orders, 0)";
    case "sales":
      return "COALESCE(o.sales, 0)";
    case "cvr":
      return "(CASE WHEN s.sessions > 0 THEN COALESCE(o.orders, 0) / s.sessions * 100 ELSE 0 END)";
    default:
      return "";
  }
}

function normalizeProductConversionRequest(query) {
  const range = normalizeRangeQuery(query, {
    defaultToToday: true,
    allowDateAlias: false,
  });
  if (!range.ok) {
    return range;
  }
  const { start, end } = range.data;

  const sortBy = (query.sort_by || "sessions").toString().toLowerCase();
  const sortDir = (query.sort_dir || "desc").toString().toLowerCase();
  let visibleColumns = query.visible_columns;
  if (typeof visibleColumns === "string") {
    try {
      visibleColumns = JSON.parse(visibleColumns);
    } catch {
      visibleColumns = null;
    }
  }

  return {
    ok: true,
    spec: {
      start,
      end,
      page: Math.max(1, Number(query.page) || 1),
      pageSize: Math.min(Math.max(1, Number(query.page_size) || 10), 200),
      sortBy,
      sortCol: ALLOWED_SORT.get(sortBy) || "sessions",
      sortDir: sortDir === "asc" ? "ASC" : "DESC",
      search: (query.search || "").trim(),
      filters: normalizeRequestFilters(query),
      productTypes: parseJsonArray(query.product_types),
      pageTypes: parseJsonArray(query.page_types),
      compareStart: query.compare_start || null,
      compareEnd: query.compare_end || null,
      visibleColumns: Array.isArray(visibleColumns) ? visibleColumns : null,
    },
  };
}

function buildProductConditions(spec, baseAlias) {
  const conditions = [];
  const replacements = [];

  if (spec.search) {
    conditions.push(`${baseAlias}.landing_page_path LIKE ?`);
    replacements.push(`%${spec.search}%`);
  }

  if (Array.isArray(spec.pageTypes) && spec.pageTypes.length > 0) {
    const typeConditions = [];
    for (const type of spec.pageTypes) {
      if (type === "Product") {
        typeConditions.push(`${baseAlias}.landing_page_path LIKE '%products/%'`);
      } else if (type === "Collection") {
        typeConditions.push(`${baseAlias}.landing_page_path LIKE '%collections/%'`);
      }
    }
    if (typeConditions.length > 0) {
      conditions.push(`(${typeConditions.join(" OR ")})`);
    }
  }

  if (Array.isArray(spec.filters) && spec.filters.length > 0) {
    for (const filter of spec.filters) {
      const field = (filter.field || "").toString().toLowerCase();
      const operator = (filter.operator || "").toString().toLowerCase();
      const value = Number(filter.value);
      if (
        !VALID_FILTER_FIELDS.has(field) ||
        (operator !== "gt" && operator !== "lt") ||
        Number.isNaN(value)
      ) {
        continue;
      }
      const expression = buildMetricFilterExpression(field);
      if (!expression) continue;
      conditions.push(`${expression} ${operator === "gt" ? ">" : "<"} ?`);
      replacements.push(value);
    }
  }

  if (Array.isArray(spec.productTypes) && spec.productTypes.length > 0) {
    conditions.push(`m.product_type IN (?)`);
    replacements.push(spec.productTypes);
  }

  return {
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    replacements,
  };
}

function buildBaseCte() {
  return `
    WITH orders_60d AS (
      SELECT
        product_id,
        COUNT(DISTINCT order_name) AS orders,
        SUM((line_item_price * line_item_quantity) - COALESCE(discount_amount_per_line_item, 0)) AS sales
      FROM shopify_orders
      WHERE created_date >= ? AND created_date <= ?
        AND product_id IS NOT NULL
      GROUP BY product_id
    ),
    sessions_60d AS (
      SELECT
        product_id,
        landing_page_path,
        SUM(sessions) AS sessions,
        SUM(sessions_with_cart_additions) AS atc
      FROM mv_product_sessions_by_path_daily
      WHERE date >= ? AND date <= ?
      GROUP BY product_id, landing_page_path
    )
  `;
}

function buildSelectSql(useMappingBase, whereClause, sortCol, sortDir, pagination) {
  const selectPrefix = useMappingBase
    ? `
      SELECT
        m.product_id,
        m.landing_page_path,
        COALESCE(s.sessions, 0) AS sessions,
        COALESCE(s.atc, 0) AS atc,
        CASE WHEN s.sessions > 0 THEN ROUND(s.atc / s.sessions * 100, 4) ELSE 0 END AS atc_rate,
        COALESCE(o.orders, 0) AS orders,
        COALESCE(o.sales, 0) AS sales,
        CASE WHEN s.sessions > 0 THEN ROUND(COALESCE(o.orders, 0) / s.sessions * 100, 4) ELSE 0 END AS cvr
      FROM product_landing_mapping m
      LEFT JOIN sessions_60d s ON m.landing_page_path = s.landing_page_path
      LEFT JOIN orders_60d o ON m.product_id = o.product_id
    `
    : `
      SELECT
        s.product_id,
        s.landing_page_path,
        s.sessions,
        s.atc,
        CASE WHEN s.sessions > 0 THEN ROUND(s.atc / s.sessions * 100, 4) ELSE 0 END AS atc_rate,
        COALESCE(o.orders, 0) AS orders,
        COALESCE(o.sales, 0) AS sales,
        CASE WHEN s.sessions > 0 THEN ROUND(COALESCE(o.orders, 0) / s.sessions * 100, 4) ELSE 0 END AS cvr
      FROM sessions_60d s
      LEFT JOIN orders_60d o ON s.product_id = o.product_id
    `;
  const limitClause = pagination
    ? ` LIMIT ${pagination.pageSize} OFFSET ${(pagination.page - 1) * pagination.pageSize}`
    : "";
  return `
    ${buildBaseCte()}
    ${selectPrefix}
    ${whereClause}
    ORDER BY ${sortCol} ${sortDir}
    ${limitClause}
  `;
}

function buildCountSql(useMappingBase, whereClause) {
  const fromSql = useMappingBase
    ? `
      FROM product_landing_mapping m
      LEFT JOIN sessions_60d s ON m.landing_page_path = s.landing_page_path
      LEFT JOIN orders_60d o ON m.product_id = o.product_id
    `
    : `
      FROM sessions_60d s
      LEFT JOIN orders_60d o ON s.product_id = o.product_id
    `;
  return `
    ${buildBaseCte()}
    SELECT COUNT(*) AS total_count
    FROM (
      SELECT 1
      ${fromSql}
      ${whereClause}
    ) AS filtered
  `;
}

function normalizeCurrentRows(rows) {
  return rows.map((row) => ({
    product_id: row.product_id || null,
    landing_page_path: row.landing_page_path || "",
    sessions: Number(row.sessions || 0),
    atc: Number(row.atc || 0),
    atc_rate: Number(row.atc_rate || 0),
    orders: Number(row.orders || 0),
    sales: Number(row.sales || 0),
    cvr: Number(row.cvr || 0),
    previous: null,
  }));
}

async function attachComparisonRows(conn, rows, spec) {
  if (!spec.compareStart || !spec.compareEnd || rows.length === 0) {
    return rows;
  }

  const productIds = [...new Set(rows.map((row) => row.product_id).filter(Boolean))];
  const paths = [
    ...new Set(rows.map((row) => row.landing_page_path).filter(Boolean)),
  ];
  const {
    currentRangeIncludesToday,
    orderCutoffTime,
    cutoffHour,
  } = buildIstCutoffContext(spec.start, spec.end);

  const [orderRows, sessionRows] = await Promise.all([
    productIds.length > 0
      ? conn.query(
          `
            SELECT
              product_id,
              COUNT(DISTINCT order_name) AS orders,
              SUM((line_item_price - COALESCE(discount_amount_per_line_item, 0)) * line_item_quantity) AS sales
            FROM shopify_orders
            WHERE created_date >= ? AND created_date <= ?
              ${currentRangeIncludesToday ? "AND created_time < ?" : ""}
              AND product_id IN (?)
            GROUP BY product_id
          `,
          {
            type: QueryTypes.SELECT,
            replacements: currentRangeIncludesToday
              ? [spec.compareStart, spec.compareEnd, orderCutoffTime, productIds]
              : [spec.compareStart, spec.compareEnd, productIds],
          },
        )
      : Promise.resolve([]),
    paths.length > 0
      ? conn.query(
          `
            SELECT
              landing_page_path,
              SUM(sessions) AS sessions,
              SUM(sessions_with_cart_additions) AS atc
            FROM ${
              currentRangeIncludesToday
                ? "hourly_product_sessions"
                : "mv_product_sessions_by_path_daily"
            }
            WHERE date >= ? AND date <= ?
              ${currentRangeIncludesToday ? "AND hour <= ?" : ""}
              AND landing_page_path IN (?)
            GROUP BY landing_page_path
          `,
          {
            type: QueryTypes.SELECT,
            replacements: currentRangeIncludesToday
              ? [spec.compareStart, spec.compareEnd, cutoffHour, paths]
              : [spec.compareStart, spec.compareEnd, paths],
          },
        )
      : Promise.resolve([]),
  ]);

  const orderMap = new Map();
  for (const row of orderRows) {
    orderMap.set(String(row.product_id), {
      orders: Number(row.orders || 0),
      sales: Number(row.sales || 0),
    });
  }

  const sessionMap = new Map();
  for (const row of sessionRows) {
    sessionMap.set(String(row.landing_page_path), {
      sessions: Number(row.sessions || 0),
      atc: Number(row.atc || 0),
    });
  }

  return rows.map((row) => {
    const previousOrders = orderMap.get(String(row.product_id)) || {
      orders: 0,
      sales: 0,
    };
    const previousSessions = sessionMap.get(String(row.landing_page_path)) || {
      sessions: 0,
      atc: 0,
    };
    const atcRate =
      previousSessions.sessions > 0
        ? (previousSessions.atc / previousSessions.sessions) * 100
        : 0;
    const cvr =
      previousSessions.sessions > 0
        ? (previousOrders.orders / previousSessions.sessions) * 100
        : 0;

    return {
      ...row,
      previous: {
        sessions: previousSessions.sessions,
        atc: previousSessions.atc,
        atc_rate: atcRate,
        orders: previousOrders.orders,
        sales: previousOrders.sales,
        cvr,
      },
    };
  });
}

function buildCsvHeaders(visibleColumns, includeCompare) {
  const requestedHeaders =
    Array.isArray(visibleColumns) && visibleColumns.length > 0
      ? CSV_HEADERS.filter(
          (header) => visibleColumns.includes(header) || header === "landing_page_path",
        )
      : CSV_HEADERS;
  if (!includeCompare) {
    return requestedHeaders;
  }
  const previousHeaders = requestedHeaders
    .filter((header) => PREVIOUS_HEADER_MAP[header])
    .map((header) => PREVIOUS_HEADER_MAP[header]);
  return [...requestedHeaders, ...previousHeaders];
}

function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function buildCsvContent(rows, headers) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    const values = headers.map((header) => {
      if (header === "landing_page_path") {
        return escapeCsv(row.landing_page_path);
      }
      if (header.startsWith("prev_")) {
        const previousKey = header.replace(/^prev_/, "");
        return Number(row.previous?.[previousKey] || 0);
      }
      return Number(row[header] || 0);
    });
    lines.push(values.join(","));
  }
  return lines.join("\n");
}

function buildProductConversionService() {
  async function getProductConversion(spec) {
    const useMappingBase =
      Array.isArray(spec.productTypes) && spec.productTypes.length > 0;
    const baseAlias = useMappingBase ? "m" : "s";
    const built = buildProductConditions(spec, baseAlias);
    const replacements = [spec.start, spec.end, spec.start, spec.end, ...built.replacements];

    const [rowsRaw, countRows] = await Promise.all([
      spec.conn.query(
        buildSelectSql(useMappingBase, built.whereClause, spec.sortCol, spec.sortDir, {
          page: spec.page,
          pageSize: spec.pageSize,
        }),
        {
          type: QueryTypes.SELECT,
          replacements,
        },
      ),
      spec.conn.query(buildCountSql(useMappingBase, built.whereClause), {
        type: QueryTypes.SELECT,
        replacements,
      }),
    ]);

    const rows = await attachComparisonRows(
      spec.conn,
      normalizeCurrentRows(rowsRaw),
      spec,
    );

    return {
      range: { start: spec.start, end: spec.end },
      page: spec.page,
      page_size: spec.pageSize,
      total_count: Number(countRows?.[0]?.total_count || 0),
      rows,
      sort: { by: spec.sortBy, dir: spec.sortDir.toLowerCase() },
    };
  }

  async function getProductConversionCsv(spec) {
    const useMappingBase =
      Array.isArray(spec.productTypes) && spec.productTypes.length > 0;
    const baseAlias = useMappingBase ? "m" : "s";
    const built = buildProductConditions(spec, baseAlias);
    const replacements = [spec.start, spec.end, spec.start, spec.end, ...built.replacements];
    const rowsRaw = await spec.conn.query(
      buildSelectSql(useMappingBase, built.whereClause, spec.sortCol, spec.sortDir),
      {
        type: QueryTypes.SELECT,
        replacements,
      },
    );

    const rows = await attachComparisonRows(
      spec.conn,
      normalizeCurrentRows(rowsRaw),
      spec,
    );
    const headers = buildCsvHeaders(
      spec.visibleColumns,
      !!(spec.compareStart && spec.compareEnd),
    );
    const dateTag =
      spec.start === spec.end ? spec.start : `${spec.start}_to_${spec.end}`;
    return {
      filename: `product_conversion_${dateTag}.csv`,
      headers,
      csv: buildCsvContent(rows, headers),
    };
  }

  return {
    normalizeProductConversionRequest,
    getProductConversion,
    getProductConversionCsv,
  };
}

module.exports = {
  buildProductConversionService,
  normalizeProductConversionRequest,
};
