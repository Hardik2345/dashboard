const { QueryTypes } = require("sequelize");
const { normalizeRangeQuery } = require("./metricsRequestNormalizer");

function normalizeBundleRequest(query = {}, options = {}) {
  const range = normalizeRangeQuery(query, {
    defaultToToday: true,
    allowDateAlias: false,
  });
  if (!range.ok) {
    return range;
  }

  const bundleProductId = (query.bundle_product_id || "")
    .toString()
    .trim();

  if (options.requireBundleProductId && !bundleProductId) {
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
      bundleProductId,
      brandKey: (query.brand_key || "").toString().trim().toUpperCase(),
    },
  };
}

function buildBundlesService() {
  async function getBundleOptions({ conn, start, end }) {
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
      bundles: rows.map((row) => ({
        bundle_product_id: String(row.bundle_product_id || ""),
        bundle_name: row.bundle_name || "",
        sort_order: Number(row.sort_order || 0),
      })),
    };
  }

  async function getBundleSummary({ conn, start, end }) {
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
      rows: rows.map((row) => ({
        bundle_product_id: String(row.bundle_product_id || ""),
        bundle_name: row.bundle_name || "",
        sort_order: Number(row.sort_order || 0),
        orders: Number(row.orders || 0),
        sales: Number(row.sales || 0),
      })),
    };
  }

  async function getBundleProducts({ conn, start, end, bundleProductId }) {
    const sql = `
      SELECT
        p.child_product_sku,
        p.child_product_title,
        COALESCE(SUM(p.allocated_orders), 0) AS orders,
        COALESCE(SUM(p.allocated_sales), 0) AS sales
      FROM bundle_product_daily_rollup p
      WHERE p.date >= ? AND p.date <= ?
        AND p.bundle_product_id = ?
      GROUP BY p.child_product_sku, p.child_product_title
      ORDER BY orders DESC, sales DESC, p.child_product_title ASC
    `;

    const rows = await conn.query(sql, {
      replacements: [start, end, bundleProductId],
      type: QueryTypes.SELECT,
    });

    return {
      rows: rows.map((row) => ({
        child_product_sku: row.child_product_sku || "",
        child_product_title: row.child_product_title || "",
        orders: Number(row.orders || 0),
        sales: Number(row.sales || 0),
      })),
    };
  }

  return {
    normalizeBundleRequest,
    getBundleOptions,
    getBundleSummary,
    getBundleProducts,
  };
}

module.exports = {
  buildBundlesService,
  normalizeBundleRequest,
};
