const { QueryTypes } = require("sequelize");
const logger = require("../utils/logger");
const { RangeSchema } = require("../validation/schemas");
const {
  computeAOV,
  computeCVR,
  computeTotalSales,
  computeTotalOrders,
  rawSum,
  appendUtmWhere,
  extractFilters,
} = require("../utils/metricsUtils");
const { formatIsoDate } = require("../utils/dateUtils");
const { requireBrandKey } = require("../utils/brandHelpers");
const { getBrands } = require("../config/brands");
const { getBrandConnection } = require("../lib/brandConnectionManager");
const {
  queryHourlyProductSessions,
} = require("../services/duckdbQueryService");
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
    aov: async (req, res) => {
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

        // Cache check
        if (start && end && start === end) {
          const cached = await cacheService.fetchCachedMetrics(req.brandKey, start);
          if (cached) {
            logger.debug(
              `[CACHE USE] AOV for ${req.brandKey} on ${start} | Value: ${cached.average_order_value}`,
            );
            return res.json({
              metric: "AOV",
              range: { start, end },
              total_sales: cached.total_sales,
              total_orders: cached.total_orders,
              aov: cached.average_order_value,
            });
          }
        }

        const result = await computeAOV({
          start,
          end,
          conn: brandConn.conn,
          filters: extractFilters(req),
        });
        logger.debug(
          `[DB FETCH] AOV for ${req.brandKey} on range ${start} to ${end} | Result: ${JSON.stringify({ total_sales: result.total_sales, total_orders: result.total_orders, aov: result.aov })}`,
        );
        return res.json({
          metric: "AOV",
          range: { start: start || null, end: end || null },
          total_sales: result.total_sales,
          total_orders: result.total_orders,
          aov: result.aov,
        });
      } catch (err) {
        logger.error("[aov] failed", err);
        return res.status(500).json({ error: "Internal server error" });
      }
    },

    cvr: async (req, res) => {
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

        // Cache check
        if (start && end && start === end) {
          const cached = await cacheService.fetchCachedMetrics(req.brandKey, start);
          if (cached) {
            logger.debug(
              `[CACHE USE] CVR for ${req.brandKey} on ${start} | Value: ${cached.conversion_rate}`,
            );
            return res.json({
              metric: "CVR",
              range: { start, end },
              total_orders: cached.total_orders,
              total_sessions: cached.total_sessions,
              cvr: cached.conversion_rate / 100,
              cvr_percent: cached.conversion_rate,
            });
          }
        }

        const result = await computeCVR({
          start,
          end,
          conn: brandConn.conn,
          filters: extractFilters(req),
        });
        logger.debug(
          `[DB FETCH] CVR for ${req.brandKey} on range ${start} to ${end} | Result: ${JSON.stringify({ total_orders: result.total_orders, total_sessions: result.total_sessions, cvr: result.cvr })}`,
        );
        return res.json({
          metric: "CVR",
          range: { start: start || null, end: end || null },
          total_orders: result.total_orders,
          total_sessions: result.total_sessions,
          cvr: result.cvr,
          cvr_percent: result.cvr_percent,
        });
      } catch (err) {
        logger.error("[cvr] failed", err);
        return res.status(500).json({ error: "Internal server error" });
      }
    },

    cvrDelta: async (req, res) => {
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
        const align = (req.query.align || "").toString().toLowerCase();
        const compare = (req.query.compare || "").toString().toLowerCase();
        const result = await metricsService.getCvrDelta({
          start,
          end,
          align,
          compare,
          conn: brandConn.conn,
          filters: extractFilters(req),
        });
        return res.json(result);
      } catch (err) {
        logger.error("[cvr-delta] failed", err);
        return res.status(500).json({ error: "Internal server error" });
      }
    },

    totalOrdersDelta: async (req, res) => {
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
        const align = (req.query.align || "").toString().toLowerCase();
        const compare = (req.query.compare || "").toString().toLowerCase();

        const result = await metricsService.getTotalOrdersDelta({
          start,
          end,
          align,
          compare,
          conn: brandConn.conn,
          filters: extractFilters(req),
        });
        return res.json(result);
      } catch (err) {
        logger.error("[total-orders-delta] failed", err);
        return res.status(500).json({ error: "Internal server error" });
      }
    },

    totalSalesDelta: async (req, res) => {
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
        const align = (req.query.align || "").toString().toLowerCase();
        const compare = (req.query.compare || "").toString().toLowerCase();
        const result = await metricsService.getTotalSalesDelta({
          start,
          end,
          align,
          compare,
          conn: brandConn.conn,
          filters: extractFilters(req),
        });
        return res.json(result);
      } catch (e) {
        logger.error("[total-sales-delta] failed", e);
        return res.status(500).json({ error: "Internal server error" });
      }
    },

    rolling30d: async (req, res) => {
      try {
        const normalized = normalizeMetricRequest(req);
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
          .trim() || null;
        if (brandQuery) {
          const brandCheck = requireBrandKey(brandQuery);
          if (brandCheck.error) {
            return res.status(400).json({ error: brandCheck.error });
          }
        }
        const conn = req.brandDb?.sequelize || normalized.spec.conn;
        if (!conn) {
          return res
            .status(500)
            .json({ error: "Brand DB connection unavailable" });
        }
        return res.json(
          await metricsService.getRolling30d({
            conn,
            brandKey: brandQuery,
            end: req.query.end || null,
            filters: normalized.spec.filters,
          }),
        );
      } catch (e) {
        logger.error("[rolling30d] failed", e);
        return res.status(500).json({ error: "Internal server error" });
      }
    },

    totalSessionsDelta: async (req, res) => {
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
        const align = (req.query.align || "").toString().toLowerCase();
        const compare = (req.query.compare || "").toString().toLowerCase();
        const result = await metricsService.getTotalSessionsDelta({
          start,
          end,
          align,
          compare,
          conn: brandConn.conn,
          filters: extractFilters(req),
        });
        return res.json(result);
      } catch (e) {
        logger.error("[total-sessions-delta] failed", e);
        return res.status(500).json({ error: "Internal server error" });
      }
    },

    atcSessionsDelta: async (req, res) => {
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
        const align = (req.query.align || "").toString().toLowerCase();
        const compare = (req.query.compare || "").toString().toLowerCase();
        const result = await metricsService.getAtcSessionsDelta({
          start,
          end,
          align,
          compare,
          conn: brandConn.conn,
          filters: extractFilters(req),
        });
        return res.json(result);
      } catch (e) {
        logger.error("[atc-sessions-delta] failed", e);
        return res.status(500).json({ error: "Internal server error" });
      }
    },

    aovDelta: async (req, res) => {
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
        const align = (req.query.align || "").toString().toLowerCase();
        const compare = (req.query.compare || "").toString().toLowerCase();
        const result = await metricsService.getAovDelta({
          start,
          end,
          align,
          compare,
          conn: brandConn.conn,
          filters: extractFilters(req),
        });
        return res.json(result);
      } catch (e) {
        logger.error("[aov-delta] failed", e);
        return res.status(500).json({ error: "Internal server error" });
      }
    },

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

    totalSales: async (req, res) => {
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

        // Cache check
        if (start && end && start === end) {
          const cached = await cacheService.fetchCachedMetrics(req.brandKey, start);
          if (cached) {
            return res.json({
              metric: "TOTAL_SALES",
              range: { start, end },
              total_sales: cached.total_sales,
            });
          }
        }

        const total_sales = await computeTotalSales({
          start,
          end,
          conn: brandConn.conn,
          filters: extractFilters(req),
        });
        if (start && end && start === end) {
          const cached = await cacheService.fetchCachedMetrics(req.brandKey, start);
          if (cached) {
            logger.debug(
              `[CACHE USE] TOTAL_SALES for ${req.brandKey} on ${start} | Value: ${cached.total_sales}`,
            );
            return res.json({
              metric: "TOTAL_SALES",
              range: { start: start || null, end: end || null },
              total_sales: cached.total_sales,
            });
          }
        }
        logger.debug(
          `[DB FETCH] TOTAL_SALES for ${req.brandKey} on range ${start} to ${end} | Result: ${total_sales}`,
        );
        return res.json({
          metric: "TOTAL_SALES",
          range: { start: start || null, end: end || null },
          total_sales,
        });
      } catch (err) {
        logger.error("[total-sales] failed", err);
        return res.status(500).json({ error: "Internal server error" });
      }
    },

    totalOrders: async (req, res) => {
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

        // Cache check
        if (start && end && start === end) {
          const cached = await cacheService.fetchCachedMetrics(req.brandKey, start);
          if (cached) {
            return res.json({
              metric: "TOTAL_ORDERS",
              range: { start, end },
              total_orders: cached.total_orders,
            });
          }
        }

        const total_orders = await computeTotalOrders({
          start,
          end,
          conn: brandConn.conn,
          filters: extractFilters(req),
        });
        if (start && end && start === end) {
          const cached = await cacheService.fetchCachedMetrics(req.brandKey, start);
          if (cached) {
            logger.debug(
              `[CACHE USE] TOTAL_ORDERS for ${req.brandKey} on ${start} | Value: ${cached.total_orders}`,
            );
            return res.json({
              metric: "TOTAL_ORDERS",
              range: { start: start || null, end: end || null },
              total_orders: cached.total_orders,
            });
          }
        }
        logger.debug(
          `[DB FETCH] TOTAL_ORDERS for ${req.brandKey} on range ${start} to ${end} | Result: ${total_orders}`,
        );
        return res.json({
          metric: "TOTAL_ORDERS",
          range: { start: start || null, end: end || null },
          total_orders,
        });
      } catch (err) {
        logger.error("[total-orders] failed", err);
        return res.status(500).json({ error: "Internal server error" });
      }
    },

    funnelStats: async (req, res) => {
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
        const productIdRaw = (req.query.product_id || "").toString().trim();
        return res.json(
          await pageService.getFunnelStats({
            conn: brandConn.conn,
            start,
            end,
            productId: productIdRaw,
            filters: extractFilters(req),
          }),
        );
      } catch (err) {
        logger.error("[funnel-stats] failed", err);
        return res.status(500).json({ error: "Internal server error" });
      }
    },

    orderSplit: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({
          start: req.query.start,
          end: req.query.end,
        });
        if (!parsed.success)
          return res.status(400).json({
            error: "Invalid date range",
            details: parsed.error.flatten(),
          });
        const { start, end } = parsed.data;
        const hourLteRaw = req.query.hour_lte;
        const hasHourLte =
          hourLteRaw !== undefined && `${hourLteRaw}`.trim() !== "";
        let hourLte = null;
        if (hasHourLte) {
          hourLte = Number.parseInt(`${hourLteRaw}`.trim(), 10);
          if (!Number.isInteger(hourLte) || hourLte < 0 || hourLte > 23) {
            return res.status(400).json({
              error: "Invalid hour_lte. Expected an integer between 0 and 23.",
            });
          }
        }
        const productIdRaw = (req.query.product_id || "").toString().trim();
        const filters = extractFilters(req);
        const hasUtm = !!(
          filters.utm_source ||
          filters.utm_medium ||
          filters.utm_campaign ||
          filters.sales_channel
        );
        const useHourlyCutoff = Number.isInteger(hourLte);

        if (productIdRaw || hasUtm || useHourlyCutoff) {
          if (!start && !end) {
            return res.json({
              metric: "ORDER_SPLIT",
              range: { start: null, end: null, product_id: productIdRaw },
              cod_orders: 0,
              prepaid_orders: 0,
              partially_paid_orders: 0,
              total_orders_from_split: 0,
              cod_percent: 0,
              prepaid_percent: 0,
              partially_paid_percent: 0,
            });
          }
          const effectiveStart = start || end;
          const effectiveEnd = end || start;
          const startTs = `${effectiveStart} 00:00:00`;
          const endTsExclusive = new Date(`${effectiveEnd}T00:00:00Z`);
          if (useHourlyCutoff) {
            endTsExclusive.setUTCHours(hourLte + 1, 0, 0, 0);
          } else {
            endTsExclusive.setUTCDate(endTsExclusive.getUTCDate() + 1);
          }
          const endTs = endTsExclusive
            .toISOString()
            .slice(0, 19)
            .replace("T", " ");

          let whereSql = `WHERE created_at >= ? AND created_at < ?`;
          let replacements = [startTs, endTs];
          if (productIdRaw) {
            whereSql += ` AND product_id = ?`;
            replacements.push(productIdRaw);
          }
          whereSql = appendUtmWhere(whereSql, replacements, filters);

          const sql = `
            SELECT payment_type, COUNT(DISTINCT order_name) AS cnt
            FROM (
              SELECT 
                CASE 
                  WHEN payment_gateway_names LIKE '%Gokwik PPCOD%' THEN 'Partial'
                  WHEN payment_gateway_names LIKE '%Cash on Delivery (COD)%' OR payment_gateway_names LIKE '%cash_on_delivery%' OR payment_gateway_names LIKE '%cash_on_delivery%' OR payment_gateway_names IS NULL OR payment_gateway_names = '' THEN 'COD'
                  ELSE 'Prepaid'
                END AS payment_type,
                order_name
              FROM shopify_orders
              ${whereSql}
              GROUP BY payment_gateway_names, order_name
            ) sub
            GROUP BY payment_type`;

          const rows = await req.brandDb.sequelize.query(sql, {
            type: QueryTypes.SELECT,
            replacements,
          });

          let cod_orders = 0;
          let prepaid_orders = 0;
          let partially_paid_orders = 0;
          for (const r of rows) {
            if (r.payment_type === "COD") cod_orders = Number(r.cnt || 0);
            else if (r.payment_type === "Prepaid")
              prepaid_orders = Number(r.cnt || 0);
            else if (r.payment_type === "Partial")
              partially_paid_orders = Number(r.cnt || 0);
          }
          const total = cod_orders + prepaid_orders + partially_paid_orders;
          const cod_percent = total > 0 ? (cod_orders / total) * 100 : 0;
          const prepaid_percent =
            total > 0 ? (prepaid_orders / total) * 100 : 0;
          const partially_paid_percent =
            total > 0 ? (partially_paid_orders / total) * 100 : 0;
          return res.json({
            metric: "ORDER_SPLIT",
            range: {
              start: effectiveStart,
              end: effectiveEnd,
              hour_lte: useHourlyCutoff ? hourLte : null,
              product_id: productIdRaw,
              ...filters,
            },
            cod_orders,
            prepaid_orders,
            partially_paid_orders,
            total_orders_from_split: total,
            cod_percent,
            prepaid_percent,
            partially_paid_percent,
            sql_used: process.env.NODE_ENV === "production" ? undefined : sql,
          });
        }

        const [cod_orders, prepaid_orders, partially_paid_orders] =
          await Promise.all([
            rawSum("cod_orders", { start, end, conn: req.brandDb.sequelize }),
            rawSum("prepaid_orders", {
              start,
              end,
              conn: req.brandDb.sequelize,
            }),
            rawSum("partially_paid_orders", {
              start,
              end,
              conn: req.brandDb.sequelize,
            }),
          ]);
        const total = cod_orders + prepaid_orders + partially_paid_orders;
        const cod_percent = total > 0 ? (cod_orders / total) * 100 : 0;
        const prepaid_percent = total > 0 ? (prepaid_orders / total) * 100 : 0;
        const partially_paid_percent =
          total > 0 ? (partially_paid_orders / total) * 100 : 0;
        return res.json({
          metric: "ORDER_SPLIT",
          range: {
            start: start || null,
            end: end || null,
            hour_lte: useHourlyCutoff ? hourLte : null,
          },
          cod_orders,
          prepaid_orders,
          partially_paid_orders,
          total_orders_from_split: total,
          cod_percent,
          prepaid_percent,
          partially_paid_percent,
        });
      } catch (err) {
        logger.error("[order-split] failed", err);
        return res.status(500).json({ error: "Internal server error" });
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
        const conn = req.brandDb?.sequelize;
        if (!conn)
          return res
            .status(500)
            .json({ error: "Brand DB connection unavailable" });

        const date = req.query.date || formatIsoDate(new Date());

        // Select distinct product types (ignoring date as mapping is current-state only)
        const sql = `
          SELECT DISTINCT product_type 
          FROM product_landing_mapping 
          WHERE product_type IS NOT NULL 
            AND product_type != ''
          ORDER BY product_type ASC
        `;

        const types = await conn.query(sql, {
          type: QueryTypes.SELECT,
        });

        // Return array of strings
        return res.json({
          date,
          types: types.map((t) => t.product_type),
        });
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
        const todayStr = formatIsoDate(new Date());
        const parsed = RangeSchema.safeParse({
          start: req.query.start || todayStr,
          end: req.query.end || todayStr,
        });
        if (!parsed.success)
          return res
            .status(400)
            .json({ error: "Invalid date range", details: parsed.error.flatten() });
        const { start, end } = parsed.data;
        if (start && end && start > end)
          return res.status(400).json({ error: "start must be on or before end" });

        // Enforce max 90-day export window
        const startD = new Date(start);
        const endD = new Date(end);
        const diffDays = Math.round((endD - startD) / 86400000);
        if (diffDays > 90)
          return res.status(400).json({ error: "Export range cannot exceed 90 days" });

        const conn = req.brandDb?.sequelize;
        if (!conn)
          return res.status(500).json({ error: "Brand DB connection unavailable" });

        const brandKey = (req.brandKey || "").toString().trim().toUpperCase();

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

        const rows = await queryHourlyProductSessions({
          brandKey,
          conn,
          startDate: start,
          endDate: end,
          filters,
        });

        const dateTag = start === end ? start : `${start}_to_${end}`;
        const filename = `hourly_product_sessions_${brandKey || "all"}_${dateTag}.csv`;

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

        const headers = [
          "date", "hour", "landing_page_type", "landing_page_path",
          "product_id", "product_title",
          "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
          "referrer_name", "sessions", "sessions_with_cart_additions",
        ];

        const escapeCsv = (val) => {
          if (val === null || val === undefined) return "";
          const str = String(val);
          if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
          return str;
        };

        const lines = [headers.join(",")];
        for (const r of rows) {
          const rowVals = headers.map((h) => {
            if (h === "date") {
              const d = r.date;
              if (d instanceof Date) {
                return d.toISOString().slice(0, 10);
              }
              return escapeCsv(d);
            }
            if (h === "sessions" || h === "sessions_with_cart_additions" || h === "hour") {
              return Number(r[h] || 0);
            }
            return escapeCsv(r[h]);
          });
          lines.push(rowVals.join(","));
        }
        return res.send(lines.join("\n"));
      } catch (e) {
        logger.error("[hourly-product-sessions-export] failed", e);
        return res.status(500).json({ error: "Internal server error" });
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

    deltaSummary: async (req, res) => {
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
          throw new Error("Database connection missing for delta summary");
        }
        normalized.spec.brandKey = brandQuery;
        return res.json(await metricsService.getDeltaSummary(normalized.spec));
      } catch (e) {
        logger.error("[deltaSummary] Error:", e);
        return res
          .status(500)
          .json({ error: "Internal server error", details: e.message });
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
