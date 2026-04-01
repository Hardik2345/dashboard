const { QueryTypes } = require("sequelize");
const logger = require("../utils/logger");
const {
  extractFilters,
} = require("../utils/metricsUtils");
const { getBrands } = require("../config/brands");
const { getBrandConnection } = require("../lib/brandConnectionManager");
const {
  normalizeMetricRequest,
  buildMetricsSnapshotService,
} = require("../services/metricsSnapshotService");
const {
  buildMetricsReportService,
  parseHourLte,
} = require("../services/metricsReportService");
const {
  buildProductConversionService,
} = require("../services/productConversionService");
const {
  buildMetricsCacheService,
} = require("../services/metricsCacheService");
const {
  parseRangeQuery,
  ensureBrandSequelize,
} = require("./metricsControllerSupport");
const {
  buildMetricsPageService,
} = require("../services/metricsPageService");

const SHOP_DOMAIN_CACHE = new Map();

function resolveShopSubdomain(brandKey) {
  if (!brandKey) return null;
  const upper = brandKey.toString().trim().toUpperCase();
  if (SHOP_DOMAIN_CACHE.has(upper)) {
    return SHOP_DOMAIN_CACHE.get(upper);
  }
  const candidates = [
    `SHOP_NAME_${upper}`,
    `${upper}_SHOP_NAME`,
    `SHOP_DOMAIN_${upper}`,
    `${upper}_SHOP_DOMAIN`,
  ];
  for (const envKey of candidates) {
    const value = process.env[envKey];
    if (value && value.trim()) {
      const trimmed = value.trim();
      SHOP_DOMAIN_CACHE.set(upper, trimmed);
      return trimmed;
    }
  }
  SHOP_DOMAIN_CACHE.set(upper, null);
  return null;
}

function buildMetricsController() {
  const cacheService = buildMetricsCacheService();
  const metricsService = buildMetricsSnapshotService({
    fetchCachedMetricsBatch: cacheService.fetchCachedMetricsBatch,
  });
  const reportService = buildMetricsReportService();
  const productConversionService = buildProductConversionService();
  const pageService = buildMetricsPageService({ cacheService });

  return {
    trafficSourceSplit: async (req, res) => {
      try {
        const parsed = parseRangeQuery(req.query);
        if (!parsed.ok)
          return res.status(400).json({ error: "Invalid date range" });
        const { start, end } = parsed.data;
        const brandConn = ensureBrandSequelize(req);
        if (!brandConn.ok) {
          return res.status(brandConn.status).json(brandConn.body);
        }
        return res.json(
          await reportService.getTrafficSourceSplit({
            conn: brandConn.conn,
            start,
            end,
            compareStart: req.query.compare_start || null,
            compareEnd: req.query.compare_end || null,
          }),
        );
      } catch (e) {
        logger.error("[traffic-source-split] failed", e);
        return res
          .status(e.status || 500)
          .json({ error: "Failed to load traffic source split" });
      }
    },

    orderSplit: async (req, res) => {
      try {
        const parsed = parseRangeQuery(req.query);
        if (!parsed.ok) {
          return res.status(parsed.status).json(parsed.body);
        }
        const { start, end } = parsed.data;
        const brandConn = ensureBrandSequelize(req);
        if (!brandConn.ok) {
          return res.status(brandConn.status).json(brandConn.body);
        }
        const { hourLte } = parseHourLte(req.query.hour_lte);
        return res.json(
          await reportService.getOrderSplit({
            conn: brandConn.conn,
            start,
            end,
            hourLte,
            productId: (req.query.product_id || "").toString().trim(),
            filters: extractFilters(req),
            includeSql: process.env.NODE_ENV !== "production",
          }),
        );
      } catch (err) {
        logger.error("[order-split] failed", err);
        return res
          .status(err.status || 500)
          .json({ error: err.status ? err.message : "Internal server error" });
      }
    },

    paymentSalesSplit: async (req, res) => {
      try {
        const parsed = parseRangeQuery(req.query);
        if (!parsed.ok) {
          return res.status(parsed.status).json(parsed.body);
        }
        const { start, end } = parsed.data;
        const brandConn = ensureBrandSequelize(req);
        if (!brandConn.ok) {
          return res.status(brandConn.status).json(brandConn.body);
        }
        const { hourLte } = parseHourLte(req.query.hour_lte);
        const productIdRaw = (req.query.product_id || "").toString().trim();
        const filters = extractFilters(req);
        return res.json(
          await reportService.getPaymentSalesSplit({
            conn: brandConn.conn,
            start,
            end,
            hourLte,
            productId: productIdRaw,
            filters,
            includeSql: process.env.NODE_ENV !== "production",
          }),
        );
      } catch (e) {
        logger.error("[payment-sales-split] failed", e);
        return res
          .status(e.status || 500)
          .json({ error: "Failed to load payment sales split" });
      }
    },

    topProductPages: async (req, res) => {
      try {
        const parsed = parseRangeQuery(req.query);
        if (!parsed.ok) {
          return res.status(parsed.status).json(parsed.body);
        }
        const { start, end } = parsed.data;
        const brandConn = ensureBrandSequelize(req);
        if (!brandConn.ok) {
          return res.status(brandConn.status).json(brandConn.body);
        }
        const rangeStart = start || end;
        const rangeEnd = end || start;
        if (!rangeStart || !rangeEnd) {
          return res.status(400).json({ error: "start or end date required" });
        }
        if (rangeStart > rangeEnd) {
          return res
            .status(400)
            .json({ error: "start must be on or before end" });
        }

        const limitParam = Number(req.query.limit);
        const limit = Number.isFinite(limitParam)
          ? Math.min(Math.max(Math.trunc(limitParam), 1), 20)
          : 5;
        return res.json(
          await pageService.getTopProductPages({
            conn: brandConn.conn,
            brandKey: req.brandKey,
            start: rangeStart,
            end: rangeEnd,
            limit,
            resolveShopSubdomain,
          }),
        );
      } catch (e) {
        logger.error("[top-pdps] failed", e);
        return res.status(500).json({ error: "Failed to load top PDP pages" });
      }
    },

    topProducts: async (req, res) => {
      try {
        const parsed = parseRangeQuery(req.query);
        if (!parsed.ok) {
          return res.status(parsed.status).json(parsed.body);
        }
        const { start, end } = parsed.data;
        const brandConn = ensureBrandSequelize(req);
        if (!brandConn.ok) {
          return res.status(brandConn.status).json(brandConn.body);
        }
        const rangeStart = start || end;
        const rangeEnd = end || start;
        if (!rangeStart || !rangeEnd) {
          return res.status(400).json({ error: "start or end date required" });
        }
        if (rangeStart > rangeEnd) {
          return res
            .status(400)
            .json({ error: "start must be on or before end" });
        }

        const limitParam = Number(req.query.limit);
        const limit = Number.isFinite(limitParam)
          ? Math.min(Math.max(Math.trunc(limitParam), 1), 50)
          : 50;
        return res.json(
          await pageService.getTopProducts({
            conn: brandConn.conn,
            brandKey: req.brandKey,
            start: rangeStart,
            end: rangeEnd,
            limit,
          }),
        );
      } catch (e) {
        logger.error("[top-products] failed", e);
        return res.status(500).json({ error: "Failed to load top products" });
      }
    },

    productKpis: async (req, res) => {
      try {
        const parsed = parseRangeQuery(req.query);
        if (!parsed.ok) {
          return res.status(parsed.status).json(parsed.body);
        }
        const { start, end } = parsed.data;
        const brandConn = ensureBrandSequelize(req);
        if (!brandConn.ok) {
          return res.status(brandConn.status).json(brandConn.body);
        }
        const rangeStart = start || end;
        const rangeEnd = end || start;
        if (!rangeStart || !rangeEnd) {
          return res.status(400).json({ error: "start or end date required" });
        }
        if (rangeStart > rangeEnd) {
          return res
            .status(400)
            .json({ error: "start must be on or before end" });
        }

        return res.json(
          await pageService.getProductKpis({
            conn: brandConn.conn,
            brandKey: req.brandKey,
            start: rangeStart,
            end: rangeEnd,
            filters: extractFilters(req),
          }),
        );
      } catch (e) {
        logger.error("[product-kpis] failed", e);
        return res.status(500).json({ error: "Failed to load product KPIs" });
      }
    },

    hourlyTrend: async (req, res) => {
      try {
        const normalized = normalizeMetricRequest(req, { requireBoth: true });
        if (!normalized.ok) {
          return res.status(normalized.status).json(normalized.body);
        }
        if (!normalized.spec.conn) {
          return res
            .status(500)
            .json({ error: "Brand DB connection unavailable" });
        }
        return res.json(await metricsService.getTrend(normalized.spec, "hourly"));
      } catch (e) {
        logger.error("[hourly-trend] failed", e);
        return res.status(500).json({ error: "Internal server error" });
      }
    },

    dailyTrend: async (req, res) => {
      try {
        const normalized = normalizeMetricRequest(req, { requireBoth: true });
        if (!normalized.ok) {
          return res.status(normalized.status).json(normalized.body);
        }
        if (!normalized.spec.conn) {
          return res
            .status(500)
            .json({ error: "Brand DB connection unavailable" });
        }
        return res.json(await metricsService.getTrend(normalized.spec, "daily"));
      } catch (e) {
        logger.error("[daily-trend] failed", e);
        return res.status(500).json({ error: "Internal server error" });
      }
    },

    monthlyTrend: async (req, res) => {
      try {
        const normalized = normalizeMetricRequest(req, { requireBoth: true });
        if (!normalized.ok) {
          return res.status(normalized.status).json(normalized.body);
        }
        if (!normalized.spec.conn) {
          return res
            .status(500)
            .json({ error: "Brand DB connection unavailable" });
        }
        return res.json(await metricsService.getTrend(normalized.spec, "monthly"));
      } catch (e) {
        logger.error("[monthly-trend] failed", e);
        return res.status(500).json({ error: "Internal server error" });
      }
    },

    productConversion: async (req, res) => {
      try {
        const normalized = productConversionService.normalizeProductConversionRequest(
          req.query,
        );
        if (!normalized.ok) {
          return res.status(normalized.status).json(normalized.body);
        }
        const conn = req.brandDb?.sequelize;
        if (!conn)
          return res
            .status(500)
            .json({ error: "Brand DB connection unavailable" });
        return res.json(
          await productConversionService.getProductConversion({
            ...normalized.spec,
            conn,
          }),
        );
      } catch (e) {
        logger.error("[product-conversion] failed", e);
        return res.status(500).json({ error: "Internal server error" });
      }
    },

    productTypes: async (req, res) => {
      try {
        const brandConn = ensureBrandSequelize(req);
        if (!brandConn.ok) {
          return res.status(brandConn.status).json(brandConn.body);
        }
        return res.json(
          await pageService.getProductTypes({
            conn: brandConn.conn,
            date: req.query.date,
          }),
        );
      } catch (e) {
        logger.error("[product-types] failed", e);
        return res.status(500).json({ error: "Internal server error" });
      }
    },

    productConversionCsv: async (req, res) => {
      try {
        const normalized = productConversionService.normalizeProductConversionRequest(
          req.query,
        );
        if (!normalized.ok) {
          return res.status(normalized.status).json(normalized.body);
        }
        const conn = req.brandDb?.sequelize;
        if (!conn)
          return res
            .status(500)
            .json({ error: "Brand DB connection unavailable" });
        const exportResult =
          await productConversionService.getProductConversionCsv({
            ...normalized.spec,
            conn,
          });
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${exportResult.filename}"`,
        );
        return res.send(exportResult.csv);
      } catch (e) {
        logger.error("[product-conversion-csv] failed", e);
        return res.status(500).json({ error: "Internal server error" });
      }
    },

    hourlyProductSessionsExport: async (req, res) => {
      try {
        const parsed = parseRangeQuery(req.query, { defaultToToday: true });
        if (!parsed.ok) {
          return res.status(parsed.status).json(parsed.body);
        }
        const { start, end } = parsed.data;
        const brandConn = ensureBrandSequelize(req);
        if (!brandConn.ok) {
          return res.status(brandConn.status).json(brandConn.body);
        }
        const filters = {};
        const filterKeys = [
          "product_id", "landing_page_path",
          "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
          "referrer_name",
        ];
        for (const key of filterKeys) {
          if (req.query[key]) filters[key] = req.query[key];
        }
        if (req.query.hour !== undefined) filters.hour = req.query.hour;
        const exportResult = await pageService.getHourlyProductSessionsExport({
          conn: brandConn.conn,
          brandKey: (req.brandKey || "").toString().trim().toUpperCase(),
          start,
          end,
          filters,
        });

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${exportResult.filename}"`,
        );
        return res.send(exportResult.csv);
      } catch (e) {
        logger.error("[hourly-product-sessions-export] failed", e);
        return res.status(e.status || 500).json({ error: e.message || "Internal server error" });
      }
    },

    hourlySalesCompare: async (req, res) => {
      try {
        const brandKey = (req.query.brand_key || req.query.brand || "")
          .toString()
          .trim()
          .toUpperCase();
        if (!brandKey)
          return res.status(400).json({ error: "brand_key required" });
        const map = getBrands();
        if (!map[brandKey])
          return res.status(400).json({ error: "Unknown brand_key" });
        const brandConn = await getBrandConnection(map[brandKey]);
        const daysParam = (req.query.days || "").toString();
        const N = Number(daysParam) || 1;
        if (N <= 0 || N > 30)
          return res
            .status(400)
            .json({ error: "days must be between 1 and 30" });
        return res.json(
          await reportService.getHourlySalesCompare({
            conn: brandConn.sequelize,
            days: N,
          }),
        );
      } catch (e) {
        logger.error("[hourly-sales-compare] failed", e);
        return res.status(500).json({ error: "Internal server error" });
      }
    },

    hourlySalesSummary: async (req, res) => {
      try {
        const brandKey = (req.brandKey || req.query.brand_key || "")
          .toString()
          .trim()
          .toUpperCase();
        if (!brandKey)
          return res.status(400).json({ error: "Brand key required" });
        const brandConn = ensureBrandSequelize(req);
        if (!brandConn.ok) {
          return res.status(brandConn.status).json(brandConn.body);
        }
        return res.json(
          await pageService.getHourlySalesSummary({
            conn: brandConn.conn,
            brandKey,
          }),
        );
      } catch (e) {
        logger.error("[hourlySalesSummary] failed", e);
        return res.status(500).json({ error: "Internal server error" });
      }
    },

    diagnoseTotalOrders: (sequelize) => async (req, res) => {
      try {
        const start = req.query.start;
        const end = req.query.end;
        const [envInfo] = await sequelize.query(
          "SELECT DATABASE() AS db, @@hostname AS host, @@version AS version",
          { type: QueryTypes.SELECT },
        );
        const sqlTotal =
          "SELECT COALESCE(SUM(total_orders),0) AS total FROM overall_summary WHERE date >= ? AND date <= ?";
        const sqlDaily =
          "SELECT date, SUM(total_orders) AS total_orders FROM overall_summary WHERE date >= ? AND date <= ? GROUP BY date ORDER BY date";
        const [totalRow] = await sequelize.query(sqlTotal, {
          type: QueryTypes.SELECT,
          replacements: [start, end],
        });
        const daily = await sequelize.query(sqlDaily, {
          type: QueryTypes.SELECT,
          replacements: [start, end],
        });
        res.json({
          connecting_to: envInfo,
          range: { start, end },
          sql_total: sqlTotal,
          sql_params: [start, end],
          total_orders: Number(totalRow.total || 0),
          daily_breakdown: daily.map((r) => ({
            date: r.date,
            total_orders: Number(r.total_orders || 0),
          })),
        });
      } catch (e) {
        logger.error("[diagnose-total-orders] failed", e);
        res.status(500).json({ error: e.message });
      }
    },

    dashboardSummary: async (req, res) => {
      try {
        const normalized = normalizeMetricRequest(req, { defaultToToday: true });
        if (!normalized.ok) {
          return res.status(normalized.status).json(normalized.body);
        }
        const brandQuery = (
          req.query.brand ||
          req.query.brand_key ||
          req.brandKey ||
          ""
        )
          .toString()
          .trim();
        if (!brandQuery) {
          return res.status(400).json({ error: "Missing brand_key" });
        }
        if (!normalized.spec.conn) {
          throw new Error("Database connection missing (tenant router required)");
        }
        normalized.spec.brandKey = brandQuery;
        const response = await metricsService.getDashboardSummary(normalized.spec);
        if (req.query.include_utm_options === "true") {
          response.filter_options = await metricsService.getSummaryFilterOptions({
            conn: normalized.spec.conn,
            start: normalized.spec.start,
            end: normalized.spec.end,
          });
        }
        return res.json(response);
      } catch (e) {
        logger.error("[dashboardSummary] Error:", e);
        return res
          .status(500)
          .json({ error: "Internal server error", details: e.message });
      }
    },
  };
}

module.exports = { buildMetricsController };
