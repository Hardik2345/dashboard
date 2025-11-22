const express = require('express');
const { requireAuth } = require('../middlewares/auth');
const { brandContext } = require('../middlewares/brandContext');
const { buildExternalController } = require('../controllers/externalController');

function buildExternalRouter() {
  const router = express.Router();
  const controller = buildExternalController();

  router.get('/last-updated/pts', requireAuth, brandContext, controller.lastUpdated);

  return router;
}

module.exports = { buildExternalRouter };
