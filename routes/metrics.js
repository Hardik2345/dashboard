const express = require('express');
const { requireAuth, requireAuthor } = require('../middlewares/auth');
const { brandContext, authorizeBrandContext } = require('../middlewares/brandContext');
const { createApiKeyAuthMiddleware } = require('../middlewares/apiKeyAuth');
const { requireBrandKey } = require('../utils/brandHelpers');
const { getBrandConnection } = require('../lib/brandConnectionManager');
const { buildMetricsController } = require('../controllers/metricsController');

function buildMetricsRouter(sequelize) {
  const router = express.Router();
  // Record arrival time for simple tracing
  router.use((req, _res, next) => {
    if (!req._reqStart) req._reqStart = Date.now();
    // Add X-Response-Time header for downstream visibility
    const start = req._reqStart;
    const origEnd = _res.end;
    _res.end = function patchedEnd(...args) {
      const duration = Date.now() - start;
      if (!_res.headersSent) {
        _res.setHeader('X-Response-Time', `${duration}ms`);
      }
      _res.end = origEnd;
      return _res.end(...args);
    };
    next();
  });
  const controller = buildMetricsController();
  const apiKeyAuth = createApiKeyAuthMiddleware(sequelize, ['metrics:read']);
  const protectedBrand = [requireAuth, brandContext];

  // Allow either session auth (with brandContext) or API key auth (with brand DB lookup)
  const authOrApiKey = (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      return apiKeyAuth(req, res, next);
    }
    return requireAuth(req, res, next);
  };

  const ensureBrandDb = async (req, res, next) => {
    // If session-authenticated, reuse brandContext to attach brandDb
    if (req.user) {
      return brandContext(req, res, next);
    }

    // API key path: brand_key comes from API key middleware or query/body
    const brandKeyRaw = req.apiKey?.brandKey || req.brandKey || req.query.brand_key || req.body?.brand_key;
    const brandCheck = requireBrandKey(brandKeyRaw);
    if (brandCheck.error) return res.status(400).json({ error: brandCheck.error });

    try {
      const conn = await getBrandConnection(brandCheck.cfg);
      req.brandKey = brandCheck.key;
      req.brandDb = conn;
      return next();
    } catch (e) {
      console.error(`[brand=${brandCheck.key}] DB connection error`, e.message);
      return res.status(503).json({ error: 'Brand database unavailable' });
    }
  };

  router.get('/aov', ...protectedBrand, controller.aov);
  router.get('/cvr', ...protectedBrand, controller.cvr);
  router.get('/cvr-delta', ...protectedBrand, controller.cvrDelta);
  router.get('/total-orders-delta', ...protectedBrand, controller.totalOrdersDelta);
  router.get('/total-sales-delta', ...protectedBrand, controller.totalSalesDelta);
  router.get('/rolling-30d', ...protectedBrand, controller.rolling30d);
  router.get('/total-sessions-delta', ...protectedBrand, controller.totalSessionsDelta);
  router.get('/atc-sessions-delta', ...protectedBrand, controller.atcSessionsDelta);
  router.get('/aov-delta', ...protectedBrand, controller.aovDelta);
  router.get('/total-sales', ...protectedBrand, controller.totalSales);
  router.get('/total-orders', ...protectedBrand, controller.totalOrders);
  router.get('/funnel-stats', ...protectedBrand, controller.funnelStats);
  router.get('/order-split', ...protectedBrand, controller.orderSplit);
  router.get('/payment-sales-split', ...protectedBrand, controller.paymentSalesSplit);
  router.get('/delta-summary', requireAuth, authorizeBrandContext, controller.deltaSummary);
  // OPTIMIZED: Use authorizeBrandContext (Lazy Connection) for summary
  router.get('/summary', requireAuth, authorizeBrandContext, controller.dashboardSummary);
  router.get('/top-pdps', authOrApiKey, ensureBrandDb, controller.topProductPages);
  router.get('/top-products', authOrApiKey, ensureBrandDb, controller.topProducts);
  router.get('/product-kpis', authOrApiKey, ensureBrandDb, controller.productKpis);
  router.get('/hourly-trend', ...protectedBrand, controller.hourlyTrend);
  router.get('/daily-trend', ...protectedBrand, controller.dailyTrend);
  router.get('/product-conversion', requireAuthor, brandContext, controller.productConversion);
  router.get('/product-conversion/export', requireAuthor, brandContext, controller.productConversionCsv);

  router.get('/hourly-sales-compare', requireAuth, controller.hourlySalesCompare);
  router.get('/diagnose/total-orders', requireAuth, controller.diagnoseTotalOrders(sequelize));

  return router;
}

module.exports = { buildMetricsRouter };
