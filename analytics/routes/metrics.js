const express = require('express');
const {
  requireTrustedPrincipal,
  requireTrustedAuthor,
} = require('../middlewares/identityEdge');
const { brandContext, authorizeBrandContext } = require('../middlewares/brandContext');
const { createApiKeyAuthMiddleware } = require('../middlewares/apiKeyAuth');
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
  const protectedBrand = [requireTrustedPrincipal, brandContext];

  // Allow either trusted upstream principals or direct API key callers.
  const authOrApiKey = (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      return apiKeyAuth(req, res, next);
    }
    return requireTrustedPrincipal(req, res, next);
  };

  const ensureBrandDb = (req, res, next) => brandContext(req, res, next);

  router.get('/order-split', ...protectedBrand, controller.orderSplit);
  router.get('/payment-sales-split', ...protectedBrand, controller.paymentSalesSplit);
  router.get('/traffic-source-split', ...protectedBrand, controller.trafficSourceSplit);
  // OPTIMIZED: Use authorizeBrandContext (Lazy Connection) for summary
  router.get('/summary', requireTrustedPrincipal, authorizeBrandContext, controller.dashboardSummary);
  router.get('/top-pdps', authOrApiKey, ensureBrandDb, controller.topProductPages);
  router.get('/top-products', authOrApiKey, ensureBrandDb, controller.topProducts);
  router.get('/product-kpis', authOrApiKey, ensureBrandDb, controller.productKpis);
  router.get('/hourly-trend', ...protectedBrand, controller.hourlyTrend);
  router.get('/daily-trend', ...protectedBrand, controller.dailyTrend);
  router.get('/monthly-trend', ...protectedBrand, controller.monthlyTrend);
  router.get('/product-conversion', requireTrustedAuthor, brandContext, controller.productConversion);
  router.get('/product-conversion/export', requireTrustedAuthor, brandContext, controller.productConversionCsv);
  router.get('/hourly-product-sessions/export', requireTrustedAuthor, brandContext, controller.hourlyProductSessionsExport);
  router.get('/product-types', authOrApiKey, ensureBrandDb, controller.productTypes);

  router.get('/hourly-sales-compare', ...protectedBrand, controller.hourlySalesCompare);
  router.get('/hourly-sales-summary', ...protectedBrand, controller.hourlySalesSummary);
  router.get('/diagnose/total-orders', ...protectedBrand, controller.diagnoseTotalOrders(sequelize));

  return router;
}

module.exports = { buildMetricsRouter };
