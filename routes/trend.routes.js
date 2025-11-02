const express = require('express');

// Factory to create the trend router with injected dependencies
// deps: { requireAuth, brandContext, controllers: { TrendController } }
function createTrendRouter(deps = {}) {
  const router = express.Router();
  const { requireAuth, brandContext, controllers = {} } = deps;
  const { TrendController } = controllers;

  const guard = (h) => (typeof requireAuth === 'function' && typeof brandContext === 'function')
    ? [requireAuth, brandContext, h] : [h];

  if (TrendController?.hourlyTrend) router.get('/hourly-trend', ...guard((req, res) => TrendController.hourlyTrend(req, res)));
  if (TrendController?.dailyTrend) router.get('/daily-trend', ...guard((req, res) => TrendController.dailyTrend(req, res)));
  if (TrendController?.hourlySalesCompare) router.get('/hourly-sales-compare', ...guard((req, res) => TrendController.hourlySalesCompare(req, res)));

  return router;
}

module.exports = { createTrendRouter };
