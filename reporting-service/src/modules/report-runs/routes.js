const express = require("express");
const { z } = require("zod");
const { asyncHandler } = require("../../utils/errors");
const { parseBody } = require("../../utils/validation");
const service = require("./service");

const rejectSchema = z.object({ reason: z.string().default("") });

function buildReportRunsRouter() {
  const router = express.Router();

  router.get("/", asyncHandler(async (req, res) => {
    res.json({ data: await service.listRuns(req.tenantId) });
  }));

  router.get("/:id", asyncHandler(async (req, res) => {
    res.json({ data: await service.getRun(req.tenantId, req.params.id) });
  }));

  router.post("/:id/approve", asyncHandler(async (req, res) => {
    res.json({ data: await service.approveRun(req.tenantId, req.user, req.params.id) });
  }));

  router.post("/:id/reject", asyncHandler(async (req, res) => {
    const input = parseBody(rejectSchema, req.body);
    res.json({ data: await service.rejectRun(req.tenantId, req.user, req.params.id, input.reason) });
  }));

  router.post("/:id/resend", asyncHandler(async (req, res) => {
    res.json({ data: await service.resendRun(req.tenantId, req.params.id) });
  }));

  return router;
}

module.exports = { buildReportRunsRouter };
