const express = require('express');
// We will need to import the controller properly once we update it.
// For now, we assume buildAlertsController returns an object that will eventually have processEvent.
// Since buildAlertsController is a factory function in existing code, we might need a workaround 
// or pass dependencies. 
// However, the cleanest way is often to require the controller or pass it.
// Given strict instructions not to touch other code, I'll assume 'app.js' will pass deps to this router 
// or I'll require the controller instance if it's exported.
// Existing 'routes/alerts.js' does: const { buildAlertsController } = require('../controllers/alertsController');
// So I will maintain that pattern.

const { buildAlertsController } = require('../controllers/alertsController');
// We need models. In 'app.js' normally models are set up. 
// I'll create a builder function similar to other routes.

function buildWebhooksRouter(deps) {
  const router = express.Router();
  const controller = buildAlertsController(deps);

  // POST /qstash-events
  // Since 'processEvent' isn't added to controller yet, this code is predictive.
  // I will add 'processEvent' to alertsController.js next.
  if (controller.processEvent) {
    router.post('/qstash-events', express.json(), controller.processEvent);
  } else {
    // Fallback or placeholder until controller is updated
    router.post('/qstash-events', express.json(), async (req, res) => {
        // dynamic check in case controller is updated later in memory
        if (controller.processEvent) {
            return controller.processEvent(req, res);
        }
        console.warn('processEvent not implemented yet');
        return res.status(501).json({error: 'Not implemented'});
    });
  }

  return router;
}

module.exports = { buildWebhooksRouter };
