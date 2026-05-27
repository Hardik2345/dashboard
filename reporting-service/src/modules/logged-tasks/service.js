const LoggedTask = require("../../models/loggedTask.model");
const TaskCategory = require("../../models/taskCategory.model");
const { HttpError, notFound } = require("../../utils/errors");

async function assertCategoryTenant(tenantId, categoryId) {
  if (!categoryId) return;
  const category = await TaskCategory.findOne({ _id: categoryId, tenant_id: tenantId }).lean();
  if (!category) throw new HttpError(400, "invalid_task_category");
}

function buildFilter(tenantId, query = {}) {
  const filter = { tenant_id: tenantId };
  if (query.category_id) filter.category_id = query.category_id;
  if (query.start_at || query.end_at) {
    filter.task_date = {};
    if (query.start_at) filter.task_date.$gte = query.start_at;
    if (query.end_at) filter.task_date.$lte = query.end_at;
  }
  return filter;
}

async function listLoggedTasks(tenantId, query) {
  return LoggedTask.find(buildFilter(tenantId, query)).sort({ task_date: -1 }).lean();
}

async function createLoggedTask(tenantId, user, input) {
  await assertCategoryTenant(tenantId, input.category_id);
  return LoggedTask.create({
    ...input,
    tenant_id: tenantId,
    author_id: user.id,
    author_name: input.author_name || user.email || user.id,
  });
}

async function updateLoggedTask(tenantId, id, input) {
  await assertCategoryTenant(tenantId, input.category_id);
  const doc = await LoggedTask.findOneAndUpdate(
    { _id: id, tenant_id: tenantId },
    { $set: input },
    { new: true, runValidators: true },
  ).lean();
  if (!doc) throw notFound("logged_task_not_found");
  return doc;
}

async function deleteLoggedTask(tenantId, id) {
  const doc = await LoggedTask.findOneAndDelete({ _id: id, tenant_id: tenantId }).lean();
  if (!doc) throw notFound("logged_task_not_found");
  return { deleted: true };
}

module.exports = { listLoggedTasks, createLoggedTask, updateLoggedTask, deleteLoggedTask };
