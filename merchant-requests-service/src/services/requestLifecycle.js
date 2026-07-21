const TodoistSyncJob = require("../models/TodoistSyncJob");
const { appendEvent } = require("./events");
const { emitRequestEvent } = require("./realtime");

async function softRemoveRequest(
  request,
  { reason, source, principal, todoistLabels, markTodoistSynced = false } = {},
) {
  if (todoistLabels) request.todoist_labels = todoistLabels;
  if (markTodoistSynced) request.sync.last_synced_at = new Date();

  if (request.removed_at) {
    await request.save();
    return { removed: true, changed: false, request };
  }

  request.removed_at = new Date();
  request.removal_reason = String(reason || "manual");
  await request.save();
  await TodoistSyncJob.updateMany(
    { request_id: request._id, status: { $in: ["pending", "running"] } },
    {
      $set: {
        status: "cancelled",
        locked_at: null,
        last_error: "request_soft_removed",
      },
    },
  );
  await appendEvent(request, "request_removed", source || "system", {
    principal,
    data: { reason: request.removal_reason },
  });
  emitRequestEvent("merchant-request:removed", request);
  return { removed: true, changed: true, request };
}

module.exports = { softRemoveRequest };
