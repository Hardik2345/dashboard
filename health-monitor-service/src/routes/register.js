const express = require("express");

function buildRegisterRouter({ registryService, schedulerService, logger }) {
  const router = express.Router();

  router.post("/", async (req, res) => {
    try {
      const result = await registryService.register(req.body || {});
      if (result.changed) {
        await schedulerService.rebuild();
      }
      return res.status(200).send(result.message);
    } catch (error) {
      logger.warn("service.registration_failed", {
        error: error.message,
      });
      return res.status(error.statusCode || 500).json({
        error: error.message || "registration_failed",
      });
    }
  });

  return router;
}

module.exports = { buildRegisterRouter };
