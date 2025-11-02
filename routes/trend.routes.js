const express = require('express');

// Factory to create the trend router with injected dependencies later in Phase 2
// deps: { requireAuth, brandContext, controllers }
function createTrendRouter(/* deps */) {
  const router = express.Router();

  // Hourly trend
  router.get('/hourly-trend', (req, res) => res.status(501).json({ error: 'Not implemented (Phase 2 wiring pending)' }));
  // Daily trend
  router.get('/daily-trend', (req, res) => res.status(501).json({ error: 'Not implemented (Phase 2 wiring pending)' }));
  // Hourly sales compare
  router.get('/hourly-sales-compare', (req, res) => res.status(501).json({ error: 'Not implemented (Phase 2 wiring pending)' }));

  return router;
}

module.exports = { createTrendRouter };
