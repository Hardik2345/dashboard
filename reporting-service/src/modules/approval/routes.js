const express = require("express");
const { asyncHandler } = require("../../utils/errors");
const service = require("./service");

function buildApprovalRouter() {
  const router = express.Router();

  router.get("/:token", asyncHandler(async (req, res) => {
    res.type("html").send(await service.renderTokenPreview(req.params.token));
  }));

  router.post("/:token/approve", asyncHandler(async (req, res) => {
    await service.approveByToken(req.params.token);
    res.type("html").send("<p>Report approved and dispatched.</p>");
  }));

  router.post("/:token/reject", asyncHandler(async (req, res) => {
    await service.rejectByToken(req.params.token, req.body?.reason || "");
    res.type("html").send("<p>Report rejected.</p>");
  }));

  return router;
}

module.exports = { buildApprovalRouter };
