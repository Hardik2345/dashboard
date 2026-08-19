const express = require("express");

function buildHealthMonitorQueryRouter({ healthQueryService, logger }) {
  const router = express.Router();

  function handleError(res, error, fallbackMessage) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    logger.error(fallbackMessage, { error: error.message });
    return res.status(500).json({ error: "internal_server_error" });
  }

  router.get("/summary", async (_req, res) => {
    try {
      const summary = await healthQueryService.getSummary();
      return res.json(summary);
    } catch (error) {
      return handleError(res, error, "health_monitor.summary_failed");
    }
  });

  router.get("/services", async (_req, res) => {
    try {
      const services = await healthQueryService.listServices();
      return res.json({ services });
    } catch (error) {
      return handleError(res, error, "health_monitor.services_failed");
    }
  });

  router.get("/services/:serviceName", async (req, res) => {
    try {
      const detail = await healthQueryService.getServiceDetail(req.params.serviceName);
      if (!detail) {
        return res.status(404).json({ error: "service_not_found" });
      }
      return res.json(detail);
    } catch (error) {
      return handleError(res, error, "health_monitor.service_detail_failed");
    }
  });

  router.get("/services/:serviceName/endpoints/history", async (req, res) => {
    try {
      const { endpoint, range } = req.query;
      if (!endpoint || typeof endpoint !== "string") {
        return res.status(400).json({ error: "endpoint_required" });
      }
      const history = await healthQueryService.getEndpointHistory({
        serviceName: req.params.serviceName,
        endpoint,
        range,
      });
      return res.json(history);
    } catch (error) {
      return handleError(res, error, "health_monitor.endpoint_history_failed");
    }
  });

  router.get("/incidents", async (req, res) => {
    try {
      const { status, severity, service, from, to, page, pageSize } = req.query;
      const result = await healthQueryService.listIncidents({ status, severity, service, from, to, page, pageSize });
      return res.json(result);
    } catch (error) {
      return handleError(res, error, "health_monitor.incidents_failed");
    }
  });

  return router;
}

module.exports = { buildHealthMonitorQueryRouter };
