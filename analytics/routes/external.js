const express = require('express');
const { requireTrustedPrincipal } = require('../middlewares/identityEdge');
const { brandContext } = require('../middlewares/brandContext');
const { buildExternalController } = require('../controllers/externalController');

function buildExternalRouter() {
  const router = express.Router();
  const controller = buildExternalController();

  router.get('/last-updated/pts', requireTrustedPrincipal, brandContext, controller.lastUpdated);

  return router;
}

module.exports = { buildExternalRouter };
