const express = require('express');

// Factory to create the metrics router
// deps: { requireAuth, brandContext, controllers: { MetricsController } }
function createMetricsRouter(deps = {}) {
  const router = express.Router();
  const { requireAuth, brandContext, controllers = {} } = deps;
  const { MetricsController } = controllers;

  const guard = (h) => (typeof requireAuth === 'function' && typeof brandContext === 'function')
    ? [requireAuth, brandContext, h] : [h];

  // Core metric totals
  if (MetricsController?.aov) router.get('/aov', ...guard((req, res) => MetricsController.aov(req, res)));
  if (MetricsController?.cvr) router.get('/cvr', ...guard((req, res) => MetricsController.cvr(req, res)));
  if (MetricsController?.totalSales) router.get('/total-sales', ...guard((req, res) => MetricsController.totalSales(req, res)));
  if (MetricsController?.totalOrders) router.get('/total-orders', ...guard((req, res) => MetricsController.totalOrders(req, res)));
  if (MetricsController?.funnelStats) router.get('/funnel-stats', ...guard((req, res) => MetricsController.funnelStats(req, res)));

  // Deltas
  if (MetricsController?.cvrDelta) router.get('/cvr-delta', ...guard((req, res) => MetricsController.cvrDelta(req, res)));
  if (MetricsController?.totalOrdersDelta) router.get('/total-orders-delta', ...guard((req, res) => MetricsController.totalOrdersDelta(req, res)));
  if (MetricsController?.totalSalesDelta) router.get('/total-sales-delta', ...guard((req, res) => MetricsController.totalSalesDelta(req, res)));
  if (MetricsController?.totalSessionsDelta) router.get('/total-sessions-delta', ...guard((req, res) => MetricsController.totalSessionsDelta(req, res)));
  if (MetricsController?.atcSessionsDelta) router.get('/atc-sessions-delta', ...guard((req, res) => MetricsController.atcSessionsDelta(req, res)));
  if (MetricsController?.aovDelta) router.get('/aov-delta', ...guard((req, res) => MetricsController.aovDelta(req, res)));

  // Splits
  if (MetricsController?.orderSplit) router.get('/order-split', ...guard((req, res) => MetricsController.orderSplit(req, res)));
  if (MetricsController?.paymentSalesSplit) router.get('/payment-sales-split', ...guard((req, res) => MetricsController.paymentSalesSplit(req, res)));

  // Diagnose (under /metrics)
  if (MetricsController?.diagnoseTotalOrders) router.get('/diagnose/total-orders', ...guard((req, res) => MetricsController.diagnoseTotalOrders(req, res)));

  return router;
}

module.exports = { createMetricsRouter };
