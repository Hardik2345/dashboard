const express = require('express');
const { requireAuthor } = require('../middlewares/auth');
const { buildAlertsController } = require('../controllers/alertsController');

function buildAlertsRouter(deps) {
  const router = express.Router();
  const controller = buildAlertsController(deps);

  router.get('/', requireAuthor, controller.listAlerts);
  router.post('/', requireAuthor, controller.createAlert);
  router.put('/:id', requireAuthor, controller.updateAlert);
  router.delete('/:id', requireAuthor, controller.deleteAlert);
  router.post('/:id/status', requireAuthor, controller.setAlertStatus);

  return router;
}

module.exports = { buildAlertsRouter };
