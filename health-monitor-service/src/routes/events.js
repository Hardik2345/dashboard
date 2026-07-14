const express = require("express");

function buildEventsRouter({ applicationEventService, logger }) {
  const router = express.Router();

  router.post("/failures", async (req, res) => {
    try {
      const result = await applicationEventService.ingestFailureEvent(req.body || {});
      return res.status(202).json(result);
    } catch (error) {
      logger.warn("application_event.failure_rejected", {
        error: error.message,
      });
      return res.status(error.statusCode || 400).json({
        error: error.message || "application_event_rejected",
      });
    }
  });

  router.post("/successes", async (req, res) => {
    try {
      const result = await applicationEventService.ingestSuccessEvent(req.body || {});
      return res.status(202).json(result);
    } catch (error) {
      logger.warn("application_event.success_rejected", {
        error: error.message,
      });
      return res.status(error.statusCode || 400).json({
        error: error.message || "application_event_rejected",
      });
    }
  });

  return router;
}

module.exports = { buildEventsRouter };
