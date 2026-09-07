const express = require('express');
const { buildAlertsController } = require('../controllers/alertsController');

function buildAlertsRouter(deps) {
  const router = express.Router();
  const controller = buildAlertsController(deps);

  router.get('/', controller.listAlerts);
  router.post('/', controller.createAlert);
  router.put('/:id', controller.updateAlert);
  router.delete('/:id', controller.deleteAlert);
  router.post('/:id/status', controller.setAlertStatus);

  return router;
}

module.exports = { buildAlertsRouter };
