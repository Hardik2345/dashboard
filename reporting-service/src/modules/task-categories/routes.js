const express = require("express");
const { asyncHandler } = require("../../utils/errors");
const { parseBody } = require("../../utils/validation");
const { createTaskCategorySchema, updateTaskCategorySchema } = require("./validators");
const service = require("./service");

function buildTaskCategoriesRouter() {
  const router = express.Router();

  router.get("/", asyncHandler(async (req, res) => {
    res.json({ data: await service.listTaskCategories(req.tenantId) });
  }));

  router.post("/", asyncHandler(async (req, res) => {
    const input = parseBody(createTaskCategorySchema, req.body);
    res.status(201).json({ data: await service.createTaskCategory(req.tenantId, req.user, input) });
  }));

  router.patch("/:id", asyncHandler(async (req, res) => {
    const input = parseBody(updateTaskCategorySchema, req.body);
    res.json({ data: await service.updateTaskCategory(req.tenantId, req.user, req.params.id, input) });
  }));

  router.delete("/:id", asyncHandler(async (req, res) => {
    res.json({ data: await service.deleteTaskCategory(req.tenantId, req.params.id) });
  }));

  return router;
}

module.exports = { buildTaskCategoriesRouter };
