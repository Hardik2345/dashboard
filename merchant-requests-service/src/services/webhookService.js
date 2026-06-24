const MerchantRequest = require("../models/MerchantRequest");
const TodoistUser = require("../models/TodoistUser");
const TodoistWebhookDelivery = require("../models/TodoistWebhookDelivery");
const { appendEvent } = require("./events");
const { emitRequestEvent } = require("./realtime");
const { getBrandConfig } = require("./brandProvisioning");
const { upsertProjectSnapshot, removeProjectSnapshot } = require("./todoistProjects");

function labelsFromTask(task = {}) {
  const labels = task.labels || task.label_names || [];
  return labels.map((label) => String(label));
}

function hasRequiredLabels(task) {
  const labels = labelsFromTask(task).map((label) => label.toLowerCase());
  return labels.includes("datum") && labels.includes("merchant-request");
}

function dueDateFromTask(task = {}) {
  if (!Object.prototype.hasOwnProperty.call(task, "due")) return null;
  return String(task.due?.date || "").trim();
}

async function resolveRequestFromTask(task) {
  const taskId = String(task.id || task.task_id || task.item_id || "");
  if (taskId) {
    const existing = await MerchantRequest.findOne({ todoist_task_id: taskId });
    if (existing) return existing;
  }
  if (!hasRequiredLabels(task)) return null;
  return null;
}

// brandConfig may be null if the brand isn't provisioned yet; section updates are skipped.
async function applyTaskUpdate(request, task, brandConfig) {
  const sectionId = String(task.section_id || "");
  if (sectionId && brandConfig) {
    const sectionByStatus = brandConfig.section_by_status || {};
    const status = Object.entries(sectionByStatus).find(([, id]) => String(id) === sectionId)?.[0] || null;
    if (!status) {
      await appendEvent(request, "todoist_unmapped_section", "todoist", {
        data: { section_id: sectionId },
      });
    } else if (request.sync.pending_status) {
      await appendEvent(request, "todoist_status_conflict_ignored", "todoist", {
        data: { incoming_status: status, pending_status: request.sync.pending_status },
      });
    } else if (request.status !== status) {
      request.status = status;
      request.todoist_section_id = sectionId;
      request.sync.todoist_status_status = "synced";
      request.sync.last_synced_at = new Date();
      await appendEvent(request, "status_changed", "todoist", { data: { status, section_id: sectionId } });
    }
  }

  const assigneeId = String(task.responsible_uid || task.assignee_id || "");
  if (assigneeId) {
    if (request.sync.pending_assignment_user_id) {
      await appendEvent(request, "todoist_assignment_conflict_ignored", "todoist", {
        data: { incoming_user_id: assigneeId, pending_user_id: request.sync.pending_assignment_user_id },
      });
    } else if (request.assignee?.todoist_user_id !== assigneeId) {
      const user = await TodoistUser.findOne({ todoist_user_id: assigneeId }).lean();
      request.assignee = {
        todoist_user_id: assigneeId,
        name: user?.name || "",
        email: user?.email || "",
        unmapped: !user,
      };
      request.sync.todoist_assignment_status = "synced";
      request.sync.last_synced_at = new Date();
      await appendEvent(request, "assignment_changed", "todoist", { data: { todoist_user_id: assigneeId } });
    }
  }

  const incomingDueDate = dueDateFromTask(task);
  if (incomingDueDate !== null) {
    if (request.sync.todoist_due_date_status === "pending") {
      await appendEvent(request, "todoist_due_date_conflict_ignored", "todoist", {
        data: { incoming_due_date: incomingDueDate, pending_due_date: request.sync.pending_due_date },
      });
    } else if ((request.due_date || "") !== incomingDueDate) {
      request.due_date = incomingDueDate;
      request.sync.todoist_due_date_status = "synced";
      request.sync.last_synced_at = new Date();
      await appendEvent(request, "due_date_changed", "todoist", { data: { due_date: incomingDueDate } });
    }
  }

  request.todoist_labels = labelsFromTask(task);
  if (task.url || task.web_url) request.todoist_url = task.url || task.web_url;
  await request.save();
  emitRequestEvent("merchant-request:updated", request);
}

async function applyNoteEvent(request, note) {
  const commentId = String(note.id || note.note_id || "");
  if (commentId) {
    const existing = await require("../models/MerchantRequestEvent").findOne({
      todoist_comment_id: commentId,
    });
    if (existing) return;
  }
  await appendEvent(request, "comment_added", "todoist", {
    message: note.content || "",
    todoist_comment_id: commentId,
    data: { todoist_comment_id: commentId },
  });
  request.sync.todoist_comment_status = "synced";
  request.sync.last_synced_at = new Date();
  await request.save();
  emitRequestEvent("merchant-request:commented", request, { comment: { content: note.content || "" } });
}

async function processTodoistWebhook(payload, deliveryId, _config) {
  let delivery = null;
  if (deliveryId) {
    try {
      delivery = await TodoistWebhookDelivery.create({
        delivery_id: deliveryId,
        event_name: payload.event_name || "",
      });
    } catch (err) {
      if (err?.code === 11000) return { duplicate: true };
      throw err;
    }
  }

  try {
    const eventName = String(payload.event_name || "");
    const data = payload.event_data || {};

    // Project events keep the local project cache fresh; they have no
    // associated MerchantRequest, so handle them before request resolution.
    if (eventName.startsWith("project:")) {
      if (eventName === "project:deleted") {
        await removeProjectSnapshot(data.id || data.project_id);
      } else {
        await upsertProjectSnapshot(data);
      }
      if (delivery) {
        delivery.processed = true;
        await delivery.save();
      }
      return { processed: true };
    }

    const request = await resolveRequestFromTask(data);
    if (!request) {
      if (delivery) {
        delivery.processed = true;
        await delivery.save();
      }
      return { ignored: true };
    }

    // Look up brand config by brand_key for section → status mapping
    const brandConfig = await getBrandConfig(request.brand_key);

    if (eventName.startsWith("item:")) {
      await applyTaskUpdate(request, data, brandConfig);
    } else if (eventName.startsWith("note:")) {
      await applyNoteEvent(request, data);
    }

    if (delivery) {
      delivery.processed = true;
      await delivery.save();
    }
    return { processed: true };
  } catch (err) {
    if (delivery) {
      delivery.error = err?.message || String(err);
      await delivery.save();
    }
    throw err;
  }
}

module.exports = {
  applyNoteEvent,
  applyTaskUpdate,
  dueDateFromTask,
  hasRequiredLabels,
  processTodoistWebhook,
};
