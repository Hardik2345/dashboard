const express = require('express');

// Factory to create the external router with injected dependencies later in Phase 2
// deps: { requireAuth, brandContext }
function createExternalRouter(/* deps */) {
  const router = express.Router();

  // Per-brand last updated
  router.get('/last-updated/pts', (req, res) => res.status(501).json({ error: 'Not implemented (Phase 2 wiring pending)' }));

  return router;
}

module.exports = { createExternalRouter };
