const express = require('express');
const { requireAuth } = require('../middlewares/auth');
const { brandContext } = require('../middlewares/brandContext');
const { buildMetricsController } = require('../controllers/metricsController');

function buildMetricsRouter(sequelize) {
  const router = express.Router();
  const controller = buildMetricsController();
  const protectedBrand = [requireAuth, brandContext];

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
  router.get('/top-pdps', ...protectedBrand, controller.topProductPages);
  router.get('/hourly-trend', ...protectedBrand, controller.hourlyTrend);
  router.get('/daily-trend', ...protectedBrand, controller.dailyTrend);

  router.get('/hourly-sales-compare', requireAuth, controller.hourlySalesCompare);
  router.get('/diagnose/total-orders', requireAuth, controller.diagnoseTotalOrders(sequelize));

  return router;
}

module.exports = { buildMetricsRouter };
