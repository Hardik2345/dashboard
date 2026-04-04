const express = require('express');
const {
  requireTrustedPrincipal,
  requireTrustedAuthor,
} = require('../../shared/middleware/identityEdge');
const { brandContext, authorizeBrandContext } = require('../../shared/middleware/brandContext');
const { createApiKeyAuthMiddleware } = require('../../shared/middleware/apiKeyAuth');
const { responseTime } = require('../../shared/middleware/responseTime');
const { createAuthOrApiKeyMiddleware } = require('../../shared/middleware/authOrApiKey');
const {
  buildMetricsSnapshotService,
} = require('../../services/metricsSnapshotService');
const {
  buildMetricsReportService,
} = require('../../services/metricsReportService');
const {
  buildMetricsCacheService,
} = require('../../services/metricsCacheService');
const {
  buildMetricsPageService,
} = require('../../services/metricsPageService');
const { buildTrendController } = require('./trendController');
const { buildSplitController } = require('./splitController');
const { buildSummaryController } = require('./summaryController');
const { buildProductController } = require('./productController');

function buildMetricsRouter(sequelize) {
  const router = express.Router();
  router.use(responseTime);

  const cacheService = buildMetricsCacheService();
  const metricsService = buildMetricsSnapshotService({
    fetchCachedMetricsBatch: cacheService.fetchCachedMetricsBatch,
  });
  const reportService = buildMetricsReportService();
  const pageService = buildMetricsPageService({ cacheService });

  const trend = buildTrendController({ metricsService });
  const split = buildSplitController({ reportService });
  const summary = buildSummaryController({ metricsService });
  const product = buildProductController({ pageService });

  const apiKeyAuth = createApiKeyAuthMiddleware(sequelize, ['metrics:read']);
  const protectedBrand = [requireTrustedPrincipal, brandContext];
  const authOrApiKey = createAuthOrApiKeyMiddleware(apiKeyAuth);
  const ensureBrandDb = (req, res, next) => brandContext(req, res, next);

  router.get('/order-split', ...protectedBrand, split.orderSplit);
  router.get('/payment-sales-split', ...protectedBrand, split.paymentSalesSplit);
  router.get('/traffic-source-split', ...protectedBrand, split.trafficSourceSplit);
  router.get('/summary', requireTrustedPrincipal, authorizeBrandContext, summary.dashboardSummary);
  router.get('/summary-filter-options', requireTrustedPrincipal, authorizeBrandContext, summary.summaryFilterOptions);
  router.get('/top-pdps', authOrApiKey, ensureBrandDb, product.topProductPages);
  router.get('/top-products', authOrApiKey, ensureBrandDb, product.topProducts);
  router.get('/product-kpis', authOrApiKey, ensureBrandDb, product.productKpis);
  router.get('/hourly-trend', ...protectedBrand, trend.hourlyTrend);
  router.get('/daily-trend', ...protectedBrand, trend.dailyTrend);
  router.get('/monthly-trend', ...protectedBrand, trend.monthlyTrend);
  router.get('/hourly-product-sessions/export', requireTrustedAuthor, brandContext, product.hourlyProductSessionsExport);
  router.get('/product-types', authOrApiKey, ensureBrandDb, product.productTypes);
  router.get('/hourly-sales-compare', ...protectedBrand, split.hourlySalesCompare);
  router.get('/hourly-sales-summary', ...protectedBrand, product.hourlySalesSummary);
  router.get('/diagnose/total-orders', ...protectedBrand, summary.diagnoseTotalOrders(sequelize));

  return router;
}

module.exports = { buildMetricsRouter };
