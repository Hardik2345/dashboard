const { QueryTypes } = require("sequelize");
const { formatIsoDate } = require("../shared/utils/date");
const {
  queryHourlyProductSessions,
} = require("./duckdbQueryService");
const {
  queryProductKpiTotals,
} = require("./metricsAggregateService");

function buildMetricsPageService({ cacheService } = {}) {
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
    const totals = await queryProductKpiTotals({
      conn,
      start,
      end,
      filters,
    });
    const totalSessions = totals.total_sessions;
    const totalAtcSessions = totals.total_atc_sessions;
    const totalOrders = totals.total_orders;
    const totalSales = totals.total_sales;
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

  async function getProductTypes({ conn, date = formatIsoDate(new Date()) }) {
    const rows = await conn.query(
      `
        SELECT DISTINCT product_type
        FROM product_landing_mapping
        WHERE product_type IS NOT NULL
          AND product_type <> ''
        ORDER BY product_type ASC
      `,
      {
        type: QueryTypes.SELECT,
      },
    );

    return {
      date,
      types: rows.map((row) => row.product_type),
    };
  }

  async function getHourlyProductSessionsExport({
    conn,
    brandKey,
    start,
    end,
    filters = {},
  }) {
    const startD = new Date(start);
    const endD = new Date(end);
    const diffDays = Math.round((endD - startD) / 86400000);
    if (diffDays > 90) {
      const error = new Error("Export range cannot exceed 90 days");
      error.status = 400;
      throw error;
    }

    const rows = await queryHourlyProductSessions({
      brandKey,
      conn,
      startDate: start,
      endDate: end,
      filters,
    });

    const headers = [
      "date",
      "hour",
      "landing_page_type",
      "landing_page_path",
      "product_id",
      "product_title",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "referrer_name",
      "sessions",
      "sessions_with_cart_additions",
    ];
    const escapeCsv = (value) => {
      if (value === null || value === undefined) return "";
      const stringValue = String(value);
      if (/[",\n]/.test(stringValue)) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };

    const lines = [headers.join(",")];
    for (const row of rows) {
      lines.push(
        headers
          .map((header) => {
            if (header === "date") {
              const dateValue = row.date;
              if (dateValue instanceof Date) {
                return dateValue.toISOString().slice(0, 10);
              }
              return escapeCsv(dateValue);
            }
            if (
              header === "hour" ||
              header === "sessions" ||
              header === "sessions_with_cart_additions"
            ) {
              return Number(row[header] || 0);
            }
            return escapeCsv(row[header]);
          })
          .join(","),
      );
    }

    const dateTag = start === end ? start : `${start}_to_${end}`;
    return {
      filename: `hourly_product_sessions_${brandKey || "all"}_${dateTag}.csv`,
      csv: lines.join("\n"),
    };
  }

  return {
    getTopProductPages,
    getTopProducts,
    getProductKpis,
    getHourlySalesSummary,
    getProductTypes,
    getHourlyProductSessionsExport,
  };
}

module.exports = {
  buildMetricsPageService,
};
