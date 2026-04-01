const { QueryTypes } = require("sequelize");
const {
  computeFunnelStats,
  appendUtmWhere,
} = require("../utils/metricsUtils");

function buildMetricsPageService({ cacheService } = {}) {
  async function getFunnelStats({
    conn,
    start,
    end,
    productId = "",
    filters = {},
  }) {
    if (!productId) {
      const stats = await computeFunnelStats({
        start,
        end,
        conn,
        filters,
      });
      return {
        metric: "FUNNEL_STATS",
        range: { start: start || null, end: end || null },
        total_sessions: stats.total_sessions,
        total_atc_sessions: stats.total_atc_sessions,
        total_orders: stats.total_orders,
      };
    }

    const effectiveStart = start || end;
    const effectiveEnd = end || start;
    const rows = await conn.query(
      `
        WITH sess AS (
          SELECT
            SUM(sessions) AS total_sessions,
            SUM(sessions_with_cart_additions) AS total_atc_sessions
          FROM mv_product_sessions_by_path_daily
          WHERE date >= ? AND date <= ?
            AND product_id = ?
        ),
        ord AS (
          SELECT
            COUNT(DISTINCT order_name) AS total_orders
          FROM shopify_orders
          WHERE created_date >= ? AND created_date <= ?
            AND product_id = ?
        )
        SELECT
          COALESCE(sess.total_sessions, 0) AS total_sessions,
          COALESCE(sess.total_atc_sessions, 0) AS total_atc_sessions,
          COALESCE(ord.total_orders, 0) AS total_orders
        FROM sess CROSS JOIN ord
      `,
      {
        type: QueryTypes.SELECT,
        replacements: [
          effectiveStart,
          effectiveEnd,
          productId,
          effectiveStart,
          effectiveEnd,
          productId,
        ],
      },
    );
    const result = rows?.[0] || {
      total_sessions: 0,
      total_atc_sessions: 0,
      total_orders: 0,
    };

    return {
      metric: "FUNNEL_STATS",
      range: {
        start: effectiveStart || null,
        end: effectiveEnd || null,
        product_id: productId,
      },
      total_sessions: Number(result.total_sessions || 0),
      total_atc_sessions: Number(result.total_atc_sessions || 0),
      total_orders: Number(result.total_orders || 0),
    };
  }

  async function getTopProductPages({
    conn,
    brandKey,
    start,
    end,
    limit = 5,
    resolveShopSubdomain,
  }) {
    const rows = await conn.query(
      `
        SELECT landing_page_path,
               MAX(product_id) AS product_id,
               SUM(sessions) AS total_sessions,
               SUM(sessions_with_cart_additions) AS total_atc_sessions
        FROM mv_product_sessions_by_path_daily
        WHERE landing_page_path IS NOT NULL
          AND landing_page_path <> ''
          AND date >= ? AND date <= ?
        GROUP BY landing_page_path
        ORDER BY total_sessions DESC
        LIMIT ${limit};
      `,
      {
        type: QueryTypes.SELECT,
        replacements: [start, end],
      },
    );

    const shopSubdomain = resolveShopSubdomain ? resolveShopSubdomain(brandKey) : null;
    const host = shopSubdomain ? `${shopSubdomain}.myshopify.com` : null;

    const pages = rows.map((row, index) => {
      const totalSessions = Number(row.total_sessions || 0);
      const atcSessions = Number(row.total_atc_sessions || 0);
      const atcRate = totalSessions > 0 ? atcSessions / totalSessions : 0;
      const rawPath =
        typeof row.landing_page_path === "string"
          ? row.landing_page_path.trim()
          : "";
      const normalizedPath = rawPath.startsWith("/")
        ? rawPath
        : `/${rawPath}`;
      const fullPath = host ? `${host}${normalizedPath}` : normalizedPath;
      return {
        rank: index + 1,
        path: fullPath,
        product_id: row.product_id || null,
        sessions: totalSessions,
        sessions_with_cart_additions: atcSessions,
        add_to_cart_rate: atcRate,
        add_to_cart_rate_pct: atcRate * 100,
      };
    });

    return {
      brand_key: brandKey || null,
      range: { start, end },
      pages,
    };
  }

  async function getTopProducts({
    conn,
    brandKey,
    start,
    end,
    limit = 50,
  }) {
    const rows = await conn.query(
      `
        SELECT product_id,
               MIN(landing_page_path) AS landing_page_path,
               SUM(sessions) AS total_sessions,
               SUM(sessions_with_cart_additions) AS total_atc_sessions
        FROM mv_product_sessions_by_path_daily
        WHERE product_id IS NOT NULL
          AND product_id <> ''
          AND date >= ? AND date <= ?
        GROUP BY product_id
        ORDER BY total_sessions DESC
        LIMIT ${limit}
      `,
      {
        type: QueryTypes.SELECT,
        replacements: [start, end],
      },
    );

    return {
      brand_key: brandKey || null,
      range: { start, end },
      products: rows.map((row, index) => {
        const totalSessions = Number(row.total_sessions || 0);
        const atcSessions = Number(row.total_atc_sessions || 0);
        const atcRate = totalSessions > 0 ? atcSessions / totalSessions : 0;
        return {
          rank: index + 1,
          product_id: row.product_id,
          landing_page_path: row.landing_page_path || null,
          sessions: totalSessions,
          sessions_with_cart_additions: atcSessions,
          add_to_cart_rate: atcRate,
          add_to_cart_rate_pct: atcRate * 100,
        };
      }),
    };
  }

  async function getProductKpis({
    conn,
    brandKey,
    start,
    end,
    filters = {},
  }) {
    let sessionsSql = `
      SELECT
        SUM(sessions) AS total_sessions,
        SUM(sessions_with_cart_additions) AS total_atc_sessions
      FROM mv_product_sessions_by_path_daily
      WHERE date >= ? AND date <= ?
    `;
    const sessionReplacements = [start, end];

    if (filters.product_id) {
      if (Array.isArray(filters.product_id)) {
        sessionsSql += ` AND product_id IN (?)`;
        sessionReplacements.push(filters.product_id);
      } else {
        sessionsSql += ` AND product_id = ?`;
        sessionReplacements.push(filters.product_id);
      }
    }

    let ordersSql = `
      SELECT
        COUNT(DISTINCT order_name) AS total_orders,
        COALESCE(SUM((line_item_price - COALESCE(discount_amount_per_line_item, 0)) * line_item_quantity), 0) AS total_sales
      FROM shopify_orders
      WHERE created_date >= ? AND created_date <= ?
    `;
    const orderReplacements = [start, end];

    ordersSql = appendUtmWhere(ordersSql, orderReplacements, filters);
    if (filters.product_id) {
      if (Array.isArray(filters.product_id)) {
        ordersSql += ` AND product_id IN (?)`;
        orderReplacements.push(filters.product_id);
      } else {
        ordersSql += ` AND product_id = ?`;
        orderReplacements.push(filters.product_id);
      }
    }

    const [[sessionRow], [orderRow]] = await Promise.all([
      conn.query(sessionsSql, {
        type: QueryTypes.SELECT,
        replacements: sessionReplacements,
      }),
      conn.query(ordersSql, {
        type: QueryTypes.SELECT,
        replacements: orderReplacements,
      }),
    ]);

    const totalSessions = Number(sessionRow?.total_sessions || 0);
    const totalAtcSessions = Number(sessionRow?.total_atc_sessions || 0);
    const totalOrders = Number(orderRow?.total_orders || 0);
    const totalSales = Number(orderRow?.total_sales || 0);
    const addToCartRate =
      totalSessions > 0 ? totalAtcSessions / totalSessions : 0;
    const cvr = totalSessions > 0 ? totalOrders / totalSessions : 0;

    return {
      product_id: filters.product_id,
      brand_key: brandKey || null,
      range: { start, end },
      sessions: totalSessions,
      sessions_with_cart_additions: totalAtcSessions,
      add_to_cart_rate: addToCartRate,
      add_to_cart_rate_pct: addToCartRate * 100,
      total_orders: totalOrders,
      total_sales: totalSales,
      conversion_rate: cvr,
      conversion_rate_pct: cvr * 100,
    };
  }

  async function getHourlySalesSummary({ conn, brandKey, now = new Date() }) {
    if (!cacheService) {
      throw new Error("Hourly sales summary cache service unavailable");
    }
    return cacheService.getHourlySalesSummary({ conn, brandKey, now });
  }

  return {
    getFunnelStats,
    getTopProductPages,
    getTopProducts,
    getProductKpis,
    getHourlySalesSummary,
  };
}

module.exports = {
  buildMetricsPageService,
};
