const express = require("express");
const { asyncHandler } = require("../../utils/errors");
const { parseBody } = require("../../utils/validation");
const { createDefinitionSchema, updateDefinitionSchema } = require("./validators");
const service = require("./service");

function buildReportDefinitionsRouter() {
  const router = express.Router();

  router.get("/", asyncHandler(async (req, res) => {
    res.json({ data: await service.listDefinitions(req.tenantId) });
  }));

  router.post("/", asyncHandler(async (req, res) => {
    const input = parseBody(createDefinitionSchema, req.body);
    const doc = await service.createDefinition(req.tenantId, req.user, input);
    res.status(201).json({ data: doc });
  }));

  router.get("/:id", asyncHandler(async (req, res) => {
    res.json({ data: await service.getDefinition(req.tenantId, req.params.id) });
  }));

  router.patch("/:id", asyncHandler(async (req, res) => {
    const input = parseBody(updateDefinitionSchema, req.body);
    res.json({ data: await service.updateDefinition(req.tenantId, req.user, req.params.id, input) });
  }));

  router.post("/:id/pause", asyncHandler(async (req, res) => {
    res.json({ data: await service.setDefinitionStatus(req.tenantId, req.user, req.params.id, "paused") });
  }));

  router.post("/:id/resume", asyncHandler(async (req, res) => {
    res.json({ data: await service.setDefinitionStatus(req.tenantId, req.user, req.params.id, "active") });
  }));

  router.post("/:id/preview", asyncHandler(async (req, res) => {
    res.json({ data: await service.previewReport(req.tenantId, req.user, req.params.id, req.body || {}) });
  }));

  router.post("/:id/run-now", asyncHandler(async (req, res) => {
    res.status(202).json({ data: await service.runReportNow(req.tenantId, req.user, req.params.id, req.body || {}) });
  }));

  return router;
}

module.exports = { buildReportDefinitionsRouter };
