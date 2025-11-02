const express = require('express');

// Factory to create the external router.
// deps: { requireAuth, brandContext, controllers: { ExternalController } }
function createExternalRouter(deps = {}) {
  const router = express.Router();
  const { requireAuth, brandContext, controllers = {} } = deps;
  const { ExternalController } = controllers;

  if (ExternalController && typeof ExternalController.lastUpdatedPTS === 'function') {
    if (typeof requireAuth === 'function' && typeof brandContext === 'function') {
      router.get('/last-updated/pts', requireAuth, brandContext, (req, res) => ExternalController.lastUpdatedPTS(req, res));
    } else {
      router.get('/last-updated/pts', (req, res) => ExternalController.lastUpdatedPTS(req, res));
    }
  } else {
    router.get('/last-updated/pts', (_req, res) => res.status(500).json({ error: 'ExternalController.lastUpdatedPTS not available' }));
  }

  return router;
}

module.exports = { createExternalRouter };
