const express = require('express');
const { requireTrustedPrincipal } = require('../../shared/middleware/identityEdge');
const { brandContext } = require('../../shared/middleware/brandContext');
const { buildExternalController } = require('./controller');

function buildExternalRouter() {
  const router = express.Router();
  const controller = buildExternalController();

  router.get('/last-updated/pts', requireTrustedPrincipal, brandContext, controller.lastUpdated);

  return router;
}

module.exports = { buildExternalRouter };
