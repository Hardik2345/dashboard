const TaskCategory = require("../../models/taskCategory.model");
const { notFound } = require("../../utils/errors");

async function listTaskCategories(tenantId) {
  return TaskCategory.find({ tenant_id: tenantId }).sort({ status: 1, name: 1 }).lean();
}

async function createTaskCategory(tenantId, user, input) {
  return TaskCategory.create({
    ...input,
    tenant_id: tenantId,
    created_by: user.id,
    updated_by: user.id,
  });
}

async function updateTaskCategory(tenantId, user, id, input) {
  const doc = await TaskCategory.findOneAndUpdate(
    { _id: id, tenant_id: tenantId },
    { $set: { ...input, updated_by: user.id } },
    { new: true, runValidators: true },
  ).lean();
  if (!doc) throw notFound("task_category_not_found");
  return doc;
}

async function deleteTaskCategory(tenantId, id) {
  const doc = await TaskCategory.findOneAndUpdate(
    { _id: id, tenant_id: tenantId },
    { $set: { status: "archived" } },
    { new: true },
  ).lean();
  if (!doc) throw notFound("task_category_not_found");
  return doc;
}

module.exports = { listTaskCategories, createTaskCategory, updateTaskCategory, deleteTaskCategory };
