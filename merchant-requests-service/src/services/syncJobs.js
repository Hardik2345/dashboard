const MerchantRequest = require("../models/MerchantRequest");
const TodoistSyncJob = require("../models/TodoistSyncJob");
const TodoistUser = require("../models/TodoistUser");
const { appendEvent } = require("./events");
const { emitRequestEvent } = require("./realtime");
const { getBrandConfig, getOrProvisionBrandConfig } = require("./brandProvisioning");

function nextAttemptDate(attempts) {
  const delayMs = Math.min(60 * 60 * 1000, (2 ** Math.max(0, attempts - 1)) * 30000);
  return new Date(Date.now() + delayMs);
}

async function enqueueSyncJob(requestId, type, payload = {}) {
  return TodoistSyncJob.create({
    request_id: requestId,
    type,
    payload,
    status: "pending",
    next_attempt_at: new Date(),
  });
}

function getMerchantRaisedSectionId(brandConfig = {}) {
  return (
    brandConfig.merchant_raised_section_id ||
    brandConfig.section_by_status?.submitted ||
    brandConfig.section_by_status?.assigned ||
    brandConfig.section_by_status?.done ||
    ""
  );
}

// brandConfig must have todoist_project_id and a Merchant Raised section
function buildTaskPayload(request, brandConfig) {
  const labels = ["Datum", "merchant-request", `brand:${request.brand_key}`];
  if (request.category) labels.push(`category:${request.category}`);
  const description = [
    "[Datum Merchant Request]",
    "",
    `Datum Request ID: ${request._id}`,
    `Brand: ${request.brand_key}`,
    `Requester: ${request.requester?.name || ""} <${request.requester?.email || ""}>`,
    `Category: ${request.category || "N/A"}`,
    `Priority: ${request.priority || "normal"}`,
    "",
    request.description || "",
  ].join("\n");

  const payload = {
    content: `[${request.brand_key}] ${request.title}`,
    description,
    project_id: brandConfig.todoist_project_id,
    section_id: getMerchantRaisedSectionId(brandConfig),
    labels,
    priority: request.priority === "urgent" ? 4 : request.priority === "high" ? 3 : 1,
  };
  if (request.due_date) payload.due_date = request.due_date;
  return payload;
}

async function markRequestSyncError(request, job, err) {
  const message = err?.message || String(err);
  request.sync.last_todoist_error = message;
  if (job.type === "create_task") request.sync.todoist_task_status = "failed";
  if (job.type === "update_assignment") request.sync.todoist_assignment_status = "failed";
  if (job.type === "update_status") request.sync.todoist_status_status = "failed";
  if (job.type === "update_due_date") request.sync.todoist_due_date_status = "failed";
  if (job.type === "complete_task") request.sync.todoist_status_status = "failed";
  if (job.type === "create_comment") request.sync.todoist_comment_status = "failed";
  await request.save();
  await appendEvent(request, "todoist_sync_failed", "system", {
    message,
    data: { job_id: job._id, type: job.type, attempts: job.attempts },
  });
  emitRequestEvent("merchant-request:sync_failed", request, { error: message });
}

async function completeJob(job) {
  job.status = "completed";
  job.completed_at = new Date();
  job.last_error = "";
  await job.save();
}

async function failOrRetryJob(job, err) {
  job.attempts += 1;
  job.last_error = err?.message || String(err);
  if (err?.permanent || job.attempts >= 8) {
    job.status = "failed";
  } else {
    job.status = "pending";
    job.next_attempt_at = nextAttemptDate(job.attempts);
  }
  await job.save();
}

async function processJob(job, { todoistClient, config }) {
  const request = await MerchantRequest.findById(job.request_id);
  if (!request) {
    job.status = "failed";
    job.last_error = "request_not_found";
    await job.save();
    return;
  }

  // Gate on brand config readiness — trigger provisioning if not yet done
  const brandConfig = await getBrandConfig(request.brand_key);
  if (!brandConfig) {
    getOrProvisionBrandConfig(request.brand_key, { todoistClient, config }).catch((err) => {
      console.error(`[merchant-requests] provision trigger for ${request.brand_key}:`, err.message);
    });
    // Defer this job until provisioning completes (picked up by next reconcile
    // cycle). Release the claim so it's eligible again.
    job.status = "pending";
    job.locked_at = null;
    job.next_attempt_at = nextAttemptDate(Math.max(1, job.attempts));
    await job.save();
    return;
  }

  try {
    if (job.type === "create_task") {
      if (request.todoist_task_id) {
        request.sync.todoist_task_status = "synced";
        request.sync.last_synced_at = new Date();
        await request.save();
        await completeJob(job);
        return;
      }
      const task = await todoistClient.createTask(buildTaskPayload(request, brandConfig));
      request.todoist_task_id = String(task.id || task.task_id || "");
      request.todoist_url = task.url || task.web_url || request.todoist_url || "";
      request.todoist_section_id = String(task.section_id || job.payload.section_id || "");
      request.todoist_labels = task.labels || ["Datum", "merchant-request", `brand:${request.brand_key}`];
      request.sync.todoist_task_status = "synced";
      if (request.due_date) {
        request.sync.todoist_due_date_status = "synced";
        request.sync.pending_due_date = "";
      }
      request.sync.last_todoist_error = "";
      request.sync.last_synced_at = new Date();
      await request.save();
      await appendEvent(request, "todoist_task_synced", "system", {
        data: { todoist_task_id: request.todoist_task_id },
      });
      emitRequestEvent("merchant-request:updated", request);
      await completeJob(job);
      return;
    }

    if (!request.todoist_task_id) {
      throw new Error("todoist_task_not_linked");
    }

    if (job.type === "update_assignment") {
      const targetUserId = String(job.payload.todoist_user_id || "");
      if (request.assignee?.todoist_user_id === targetUserId && request.sync.todoist_assignment_status === "synced") {
        await completeJob(job);
        return;
      }
      await todoistClient.updateTask(request.todoist_task_id, { assignee_id: targetUserId });
      const user = await TodoistUser.findOne({ todoist_user_id: targetUserId }).lean();
      request.assignee = {
        todoist_user_id: targetUserId,
        name: user?.name || job.payload.name || "",
        email: user?.email || job.payload.email || "",
        unmapped: !user,
      };
      if (request.status !== "done") request.status = "assigned";
      request.sync.todoist_assignment_status = "synced";
      request.sync.pending_assignment_user_id = "";
      request.sync.todoist_status_status = "synced";
      request.sync.pending_status = "";
      request.sync.last_todoist_error = "";
      request.sync.last_synced_at = new Date();
      await request.save();
      await appendEvent(request, "assignment_synced", "system", { data: { todoist_user_id: targetUserId } });
      emitRequestEvent("merchant-request:updated", request);
      await completeJob(job);
      return;
    }

    if (job.type === "update_status") {
      const targetStatus = job.payload.status;
      request.status = targetStatus;
      request.sync.todoist_status_status = "synced";
      request.sync.pending_status = "";
      request.sync.last_todoist_error = "";
      request.sync.last_synced_at = new Date();
      if (targetStatus === "done" && !request.closed_at) request.closed_at = new Date();
      await request.save();
      await appendEvent(request, "status_synced", "system", { data: { status: targetStatus } });
      emitRequestEvent("merchant-request:updated", request);
      await completeJob(job);
      return;
    }

    if (job.type === "complete_task") {
      await todoistClient.completeTask(request.todoist_task_id);
      request.status = "done";
      request.sync.todoist_status_status = "synced";
      request.sync.pending_status = "";
      request.sync.last_todoist_error = "";
      request.sync.last_synced_at = new Date();
      if (!request.closed_at) request.closed_at = new Date();
      await request.save();
      await appendEvent(request, "status_synced", "system", { data: { status: "done" } });
      emitRequestEvent("merchant-request:updated", request);
      await completeJob(job);
      return;
    }

    if (job.type === "update_due_date") {
      await todoistClient.updateTask(request.todoist_task_id, { due_date: request.due_date || null });
      request.sync.todoist_due_date_status = "synced";
      request.sync.pending_due_date = "";
      request.sync.last_todoist_error = "";
      request.sync.last_synced_at = new Date();
      await request.save();
      await appendEvent(request, "due_date_synced", "system", { data: { due_date: request.due_date || "" } });
      emitRequestEvent("merchant-request:updated", request);
      await completeJob(job);
      return;
    }

    if (job.type === "create_comment") {
      const comment = await todoistClient.createComment(request.todoist_task_id, job.payload.content || "");
      await appendEvent(request, "comment_synced", "system", {
        data: { local_comment_id: job.payload.local_comment_id, todoist_comment_id: comment.id || "" },
        todoist_comment_id: String(comment.id || ""),
        local_comment_id: job.payload.local_comment_id || "",
      });
      request.sync.todoist_comment_status = "synced";
      request.sync.last_todoist_error = "";
      request.sync.last_synced_at = new Date();
      await request.save();
      emitRequestEvent("merchant-request:commented", request);
      await completeJob(job);
    }
  } catch (err) {
    await failOrRetryJob(job, err);
    if (job.status === "failed") await markRequestSyncError(request, job, err);
  }
}

// A claimed job whose worker died leaves status "running" forever; reclaim it
// after this window so it can be retried.
const STALE_LOCK_MS = 5 * 60 * 1000;

// Atomically claim the next due job (pending → running). Returns null when none
// are claimable. Using findOneAndUpdate makes this safe under concurrent
// reconcile runs / multiple instances — two workers can never grab the same job.
async function claimNextJob() {
  return TodoistSyncJob.findOneAndUpdate(
    { status: "pending", next_attempt_at: { $lte: new Date() } },
    { $set: { status: "running", locked_at: new Date() } },
    { sort: { created_at: 1 }, returnDocument: "after" },
  );
}

async function processDueJobs({ todoistClient, config, limit = 20 } = {}) {
  // Reclaim jobs orphaned in "running" past the stale window (e.g. crashed worker).
  await TodoistSyncJob.updateMany(
    { status: "running", locked_at: { $lt: new Date(Date.now() - STALE_LOCK_MS) } },
    { $set: { status: "pending" } },
  );

  let processed = 0;
  for (let i = 0; i < limit; i += 1) {
    const job = await claimNextJob();
    if (!job) break;
    await processJob(job, { todoistClient, config });
    processed += 1;
  }
  return processed;
}

module.exports = {
  buildTaskPayload,
  enqueueSyncJob,
  getMerchantRaisedSectionId,
  processDueJobs,
  processJob,
};
