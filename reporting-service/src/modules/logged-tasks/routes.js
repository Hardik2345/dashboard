const express = require("express");
const { asyncHandler } = require("../../utils/errors");
const { parseBody, parseQuery } = require("../../utils/validation");
const { createLoggedTaskSchema, updateLoggedTaskSchema, listLoggedTaskQuerySchema } = require("./validators");
const service = require("./service");

function buildLoggedTasksRouter() {
  const router = express.Router();

  router.get("/", asyncHandler(async (req, res) => {
    const query = parseQuery(listLoggedTaskQuerySchema, req.query);
    res.json({ data: await service.listLoggedTasks(req.tenantId, query) });
  }));

  router.post("/", asyncHandler(async (req, res) => {
    const input = parseBody(createLoggedTaskSchema, req.body);
    res.status(201).json({ data: await service.createLoggedTask(req.tenantId, req.user, input) });
  }));

  router.patch("/:id", asyncHandler(async (req, res) => {
    const input = parseBody(updateLoggedTaskSchema, req.body);
    res.json({ data: await service.updateLoggedTask(req.tenantId, req.params.id, input) });
  }));

  router.delete("/:id", asyncHandler(async (req, res) => {
    res.json({ data: await service.deleteLoggedTask(req.tenantId, req.params.id) });
  }));

  return router;
}

module.exports = { buildLoggedTasksRouter };
