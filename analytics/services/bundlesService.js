const { QueryTypes } = require("sequelize");
const { normalizeRangeQuery } = require("./metricsRequestNormalizer");
const { DEFAULT_TIMEZONE, normalizeTimezone } = require("./metricsFoundation");

function normalizeBundleRequest(query = {}, options = {}) {
  const range = normalizeRangeQuery(query, {
    defaultToToday: true,
    allowDateAlias: false,
    timezone: options.timezone,
  });
  if (!range.ok) {
    return range;
  }

  let rawBundleProductIds = [];
  if (typeof query.bundle_product_ids === "string" && query.bundle_product_ids.trim()) {
    try {
      const parsed = JSON.parse(query.bundle_product_ids);
      if (Array.isArray(parsed)) {
        rawBundleProductIds = parsed;
      }
    } catch {
      rawBundleProductIds = query.bundle_product_ids.split(",");
    }
  }

  if (rawBundleProductIds.length === 0) {
    rawBundleProductIds = Array.isArray(query.bundle_product_id)
      ? query.bundle_product_id
      : query.bundle_product_id
        ? [query.bundle_product_id]
        : [];
  }

  const bundleProductIds = rawBundleProductIds
    .map((value) => (value || "").toString().trim())
    .filter(Boolean);

  if (options.requireBundleProductId && bundleProductIds.length === 0) {
    return {
      ok: false,
      status: 400,
      body: { error: "bundle_product_id required" },
    };
  }

  return {
    ok: true,
    spec: {
      start: range.data.start,
      end: range.data.end,
      bundleProductId: bundleProductIds[0] || "",
      bundleProductIds,
      brandKey: (query.brand_key || "").toString().trim().toUpperCase(),
      timezone: normalizeTimezone(range.timezone || options.timezone || DEFAULT_TIMEZONE),
    },
  };
}

function buildBundlesService() {
  async function getBundleOptions({ conn, start, end, timezone }) {
    const resolvedTimezone = normalizeTimezone(timezone || DEFAULT_TIMEZONE);
    const sql = `
      SELECT
        m.bundle_product_id,
        m.bundle_name,
        COALESCE(m.sort_order, 999999) AS sort_order
      FROM bundle_master m
      INNER JOIN (
        SELECT DISTINCT bundle_product_id
        FROM bundle_daily_rollup
        WHERE date >= ? AND date <= ?
      ) d ON d.bundle_product_id = m.bundle_product_id
      WHERE COALESCE(m.is_active, 0) = 1
      ORDER BY COALESCE(m.sort_order, 999999) ASC, m.bundle_name ASC
    `;

    const rows = await conn.query(sql, {
      replacements: [start, end],
      type: QueryTypes.SELECT,
    });

    return {
      timezone: resolvedTimezone,
      bundles: rows.map((row) => ({
        bundle_product_id: String(row.bundle_product_id || ""),
        bundle_name: row.bundle_name || "",
        sort_order: Number(row.sort_order || 0),
      })),
    };
  }

  async function getBundleSummary({ conn, start, end, timezone }) {
    const resolvedTimezone = normalizeTimezone(timezone || DEFAULT_TIMEZONE);
    const sql = `
      SELECT
        d.bundle_product_id,
        COALESCE(m.bundle_name, MAX(d.bundle_name), d.bundle_product_id) AS bundle_name,
        COALESCE(m.sort_order, 999999) AS sort_order,
        COALESCE(SUM(d.bundle_order_count), 0) AS orders,
        COALESCE(SUM(d.bundle_sales), 0) AS sales
      FROM bundle_daily_rollup d
      LEFT JOIN bundle_master m
        ON m.bundle_product_id = d.bundle_product_id
      WHERE d.date >= ? AND d.date <= ?
      GROUP BY d.bundle_product_id, m.bundle_name, m.sort_order
      ORDER BY COALESCE(m.sort_order, 999999) ASC, bundle_name ASC
    `;

    const rows = await conn.query(sql, {
      replacements: [start, end],
      type: QueryTypes.SELECT,
    });

    return {
      timezone: resolvedTimezone,
      rows: rows.map((row) => ({
        bundle_product_id: String(row.bundle_product_id || ""),
        bundle_name: row.bundle_name || "",
        sort_order: Number(row.sort_order || 0),
        orders: Number(row.orders || 0),
        sales: Number(row.sales || 0),
      })),
    };
  }

  async function getBundleProducts({ conn, start, end, bundleProductIds = [], timezone }) {
    const resolvedTimezone = normalizeTimezone(timezone || DEFAULT_TIMEZONE);
    const filteredBundleIds = Array.isArray(bundleProductIds)
      ? bundleProductIds.filter(Boolean)
      : [];
    if (filteredBundleIds.length === 0) {
      return { timezone: resolvedTimezone, rows: [] };
    }

    const bundlePlaceholders = filteredBundleIds.map(() => "?").join(", ");
    const sql = `
      SELECT
        p.child_product_sku,
        p.child_product_title,
        COALESCE(SUM(p.allocated_orders), 0) AS orders,
        COALESCE(SUM(p.allocated_sales), 0) AS sales
      FROM bundle_product_daily_rollup p
      WHERE p.date >= ? AND p.date <= ?
        AND p.bundle_product_id IN (${bundlePlaceholders})
      GROUP BY p.child_product_sku, p.child_product_title
      ORDER BY orders DESC, sales DESC, p.child_product_title ASC
    `;

    const rows = await conn.query(sql, {
      replacements: [start, end, ...filteredBundleIds],
      type: QueryTypes.SELECT,
    });

    return {
      timezone: resolvedTimezone,
      rows: rows.map((row) => ({
        child_product_sku: row.child_product_sku || "",
        child_product_title: row.child_product_title || "",
        orders: Number(row.orders || 0),
        sales: Number(row.sales || 0),
      })),
    };
  }

  function escapeCsv(value) {
    if (value === null || value === undefined) return "";
    const stringValue = String(value);
    if (/[",\n]/.test(stringValue)) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  }

  async function getBundleSummaryCsv({ conn, start, end }) {
    const data = await getBundleSummary({ conn, start, end });
    const headers = ["bundle_product_id", "bundle_name", "orders", "sales"];
    const lines = [headers.join(",")];
    for (const row of data.rows) {
      const values = headers.map((header) => {
        if (header === "bundle_name") return escapeCsv(row[header]);
        return row[header];
      });
      lines.push(values.join(","));
    }
    const dateTag = start === end ? start : `${start}_to_${end}`;
    return {
      filename: `bundle_summary_${dateTag}.csv`,
      csv: lines.join("\n"),
    };
  }

  async function getBundleProductsCsv({ conn, start, end, bundleProductIds = [] }) {
    const data = await getBundleProducts({ conn, start, end, bundleProductIds });
    const headers = ["child_product_sku", "child_product_title", "orders", "sales"];
    const lines = [headers.join(",")];
    for (const row of data.rows) {
      const values = headers.map((header) => {
        if (header === "child_product_title" || header === "child_product_sku") return escapeCsv(row[header]);
        return row[header];
      });
      lines.push(values.join(","));
    }
    const dateTag = start === end ? start : `${start}_to_${end}`;
    return {
      filename: `bundle_products_${dateTag}.csv`,
      csv: lines.join("\n"),
    };
  }

  return {
    normalizeBundleRequest,
    getBundleOptions,
    getBundleSummary,
    getBundleSummaryCsv,
    getBundleProducts,
    getBundleProductsCsv,
  };
}

module.exports = {
  buildBundlesService,
  normalizeBundleRequest,
};
