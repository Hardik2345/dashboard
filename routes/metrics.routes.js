const express = require('express');

// Factory to create the metrics router with injected dependencies later in Phase 2
// deps: { requireAuth, brandContext, controllers }
function createMetricsRouter(/* deps */) {
  const router = express.Router();

  // Core metric totals
  router.get('/aov', (req, res) => res.status(501).json({ error: 'Not implemented (Phase 2 wiring pending)' }));
  router.get('/cvr', (req, res) => res.status(501).json({ error: 'Not implemented (Phase 2 wiring pending)' }));
  router.get('/total-sales', (req, res) => res.status(501).json({ error: 'Not implemented (Phase 2 wiring pending)' }));
  router.get('/total-orders', (req, res) => res.status(501).json({ error: 'Not implemented (Phase 2 wiring pending)' }));
  router.get('/funnel-stats', (req, res) => res.status(501).json({ error: 'Not implemented (Phase 2 wiring pending)' }));

  // Deltas
  router.get('/cvr-delta', (req, res) => res.status(501).json({ error: 'Not implemented (Phase 2 wiring pending)' }));
  router.get('/total-orders-delta', (req, res) => res.status(501).json({ error: 'Not implemented (Phase 2 wiring pending)' }));
  router.get('/total-sales-delta', (req, res) => res.status(501).json({ error: 'Not implemented (Phase 2 wiring pending)' }));
  router.get('/total-sessions-delta', (req, res) => res.status(501).json({ error: 'Not implemented (Phase 2 wiring pending)' }));
  router.get('/atc-sessions-delta', (req, res) => res.status(501).json({ error: 'Not implemented (Phase 2 wiring pending)' }));
  router.get('/aov-delta', (req, res) => res.status(501).json({ error: 'Not implemented (Phase 2 wiring pending)' }));

  // Splits
  router.get('/order-split', (req, res) => res.status(501).json({ error: 'Not implemented (Phase 2 wiring pending)' }));
  router.get('/payment-sales-split', (req, res) => res.status(501).json({ error: 'Not implemented (Phase 2 wiring pending)' }));

  // Diagnose (under /metrics)
  router.get('/diagnose/total-orders', (req, res) => res.status(501).json({ error: 'Not implemented (Phase 2 wiring pending)' }));

  return router;
}

module.exports = { createMetricsRouter };
