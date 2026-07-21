const MerchantRequest = require("../models/MerchantRequest");
const TodoistUser = require("../models/TodoistUser");
const TodoistWebhookDelivery = require("../models/TodoistWebhookDelivery");
const BrandTodoistConfig = require("../models/BrandTodoistConfig");
const { CATEGORIES } = require("../config");
const { appendEvent } = require("./events");
const { emitRequestEvent } = require("./realtime");
const { normalizeTodoistTaskUrl } = require("./todoistLinks");
const { softRemoveRequest } = require("./requestLifecycle");
const {
  FALLBACK_BRAND_KEY,
  ensureFallbackBrandConfig,
  getBrandConfig,
} = require("./brandProvisioning");
const { getMerchantRaisedSectionId } = require("./syncJobs");
const { upsertProjectSnapshot, removeProjectSnapshot } = require("./todoistProjects");

function labelsFromTask(task = {}) {
  const labels = task.labels || task.label_names || [];
  return labels.map((label) => String(label));
}

function hasLabelSnapshot(task = {}) {
  return Object.prototype.hasOwnProperty.call(task, "labels") ||
    Object.prototype.hasOwnProperty.call(task, "label_names");
}

function hasRequiredLabels(task) {
  const labels = labelsFromTask(task).map((label) => label.toLowerCase());
  return labels.includes("merchant-request");
}

function isTodoistImportedRequest(request) {
  return request?.requester?.user_id === "todoist";
}

async function softRemoveImportedRequest(request, task) {
  return softRemoveRequest(request, {
    reason: "todoist_tag_removed",
    source: "todoist",
    todoistLabels: labelsFromTask(task),
    markTodoistSynced: true,
  });
}

function labelValue(labels, prefix) {
  const lowerPrefix = prefix.toLowerCase();
  const match = labels.find((label) => label.toLowerCase().startsWith(lowerPrefix));
  return match ? match.slice(prefix.length).trim() : "";
}

function brandFromLabels(task = {}) {
  const brand = labelValue(labelsFromTask(task), "brand:");
  return brand ? brand.toUpperCase() : "";
}

function categoryFromLabels(task = {}) {
  const category = labelValue(labelsFromTask(task), "category:");
  return CATEGORIES.includes(category) ? category : "Feature Request";
}

function priorityFromTask(task = {}) {
  const value = Number(task.priority || 0);
  if (value >= 4) return "urgent";
  if (value === 3) return "high";
  if (value === 2) return "normal";
  return "normal";
}

function dueDateFromTask(task = {}) {
  if (!Object.prototype.hasOwnProperty.call(task, "due")) return null;
  return String(task.due?.date || "").trim();
}

function deadlineDateFromTask(task = {}) {
  if (!Object.prototype.hasOwnProperty.call(task, "deadline")) return null;
  return String(task.deadline?.date || "").trim();
}

function isTaskCompleted(task = {}, eventName = "") {
  if (eventName === "item:completed" || eventName === "item:checked" || eventName === "item:closed") return true;
  if (task.is_completed === true || task.checked === true || task.completed === true) return true;
  return false;
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

async function inferBrandKey(task = {}) {
  const projectId = String(task.project_id || "");
  if (projectId) {
    const config = await BrandTodoistConfig.findOne({
      todoist_project_id: projectId,
      provisioning_status: "ready",
    }).lean();
    if (config?.brand_key) return config.brand_key;
  }
  const labeledBrand = brandFromLabels(task);
  if (labeledBrand) return labeledBrand;
  return FALLBACK_BRAND_KEY;
}

function normalizedFallbackLabels(task = {}) {
  const labels = labelsFromTask(task);
  const next = labels.filter((label) => !label.toLowerCase().startsWith("brand:"));
  for (const required of ["Datum", "merchant-request", `brand:${FALLBACK_BRAND_KEY}`]) {
    if (!next.map((label) => label.toLowerCase()).includes(required.toLowerCase())) next.push(required);
  }
  return next;
}

async function normalizeFallbackTodoistTask(task, fallbackConfig, { todoistClient } = {}) {
  if (!todoistClient) return task;
  const taskId = String(task.id || task.task_id || task.item_id || "");
  if (!taskId) return task;
  const sectionId = getMerchantRaisedSectionId(fallbackConfig);
  const labels = normalizedFallbackLabels(task);
  const payload = {
    project_id: fallbackConfig.todoist_project_id,
    section_id: sectionId,
    labels,
  };
  await todoistClient.updateTask(taskId, payload);
  return {
    ...task,
    project_id: fallbackConfig.todoist_project_id,
    section_id: sectionId,
    labels,
  };
}

async function importRequestFromTodoistTask(task, { todoistClient, config, eventName = "" } = {}) {
  const taskId = String(task.id || task.task_id || task.item_id || "");
  if (!taskId || !hasRequiredLabels(task)) return null;

  const existing = await MerchantRequest.findOne({ todoist_task_id: taskId });
  if (existing) return existing;

  const brandKey = await inferBrandKey(task);
  let importTask = task;
  if (brandKey === FALLBACK_BRAND_KEY) {
    const fallbackConfig = await ensureFallbackBrandConfig({ todoistClient, config });
    importTask = await normalizeFallbackTodoistTask(task, fallbackConfig, { todoistClient });
  }

  const assigneeId = String(importTask.responsible_uid || importTask.assignee_id || "");
  const completed = isTaskCompleted(importTask, eventName);
  const title = String(importTask.content || importTask.title || "").trim() || "Untitled Todoist task";
  const request = await MerchantRequest.create({
    brand_key: brandKey,
    requester: { user_id: "todoist", name: "Todoist", email: "" },
    title,
    description: String(importTask.description || ""),
    category: categoryFromLabels(importTask),
    priority: priorityFromTask(importTask),
    due_date: dueDateFromTask(importTask) || "",
    deadline_date: deadlineDateFromTask(importTask) || "",
    status: completed ? "done" : assigneeId ? "assigned" : "submitted",
    assignee: assigneeId ? { todoist_user_id: assigneeId, unmapped: true } : {},
    todoist_task_id: taskId,
    todoist_url: normalizeTodoistTaskUrl(importTask),
    todoist_section_id: String(importTask.section_id || ""),
    todoist_labels: labelsFromTask(importTask),
    sync: {
      todoist_task_status: "synced",
      todoist_assignment_status: assigneeId ? "synced" : "idle",
      todoist_status_status: completed || assigneeId ? "synced" : "idle",
      todoist_due_date_status: importTask.due ? "synced" : "idle",
      todoist_deadline_status: importTask.deadline ? "synced" : "idle",
      last_synced_at: new Date(),
    },
    closed_at: completed ? new Date() : null,
  });
  await appendEvent(request, "request_imported", "todoist", {
    data: {
      todoist_task_id: taskId,
      project_id: importTask.project_id || "",
      section_id: importTask.section_id || "",
    },
  });
  emitRequestEvent("merchant-request:created", request);
  return request;
}

async function applyTaskUpdate(request, task, _brandConfig, eventName = "") {
  const labelSnapshotPresent = hasLabelSnapshot(task);
  if (isTodoistImportedRequest(request) && labelSnapshotPresent && !hasRequiredLabels(task)) {
    return softRemoveImportedRequest(request, task);
  }

  if (request.removed_at) {
    if (
      request.removal_reason !== "todoist_tag_removed" ||
      !isTodoistImportedRequest(request) ||
      !labelSnapshotPresent ||
      !hasRequiredLabels(task)
    ) {
      return { removed: true, ignored: true };
    }
    request.removed_at = null;
    request.removal_reason = "";
    await appendEvent(request, "request_restored", "todoist", {
      data: { reason: "todoist_tag_restored" },
    });
  }

  if (isTaskCompleted(task, eventName) && request.status !== "done") {
    request.status = "done";
    request.sync.todoist_status_status = "synced";
    request.sync.pending_status = "";
    request.sync.last_synced_at = new Date();
    if (!request.closed_at) request.closed_at = new Date();
    await appendEvent(request, "status_changed", "todoist", { data: { status: "done" } });
  }

  const sectionId = String(task.section_id || "");
  if (sectionId) {
    request.todoist_section_id = sectionId;
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
    if (request.status !== "done" && request.status !== "assigned") {
      request.status = "assigned";
      request.sync.todoist_status_status = "synced";
      request.sync.pending_status = "";
      request.sync.last_synced_at = new Date();
      await appendEvent(request, "status_changed", "todoist", { data: { status: "assigned" } });
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


  const incomingDeadlineDate = deadlineDateFromTask(task);
  if (incomingDeadlineDate !== null) {
    if (request.sync.todoist_deadline_status === "pending") {
      await appendEvent(request, "todoist_deadline_conflict_ignored", "todoist", {
        data: {
          incoming_deadline_date: incomingDeadlineDate,
          pending_deadline_date: request.sync.pending_deadline_date,
        },
      });
    } else if ((request.deadline_date || "") !== incomingDeadlineDate) {
      request.deadline_date = incomingDeadlineDate;
      request.sync.todoist_deadline_status = "synced";
      request.sync.last_synced_at = new Date();
      await appendEvent(request, "deadline_date_changed", "todoist", {
        data: { deadline_date: incomingDeadlineDate },
      });
    }
  }

  if (labelSnapshotPresent) request.todoist_labels = labelsFromTask(task);
  request.todoist_url =
    normalizeTodoistTaskUrl({
      ...task,
      todoist_task_id: request.todoist_task_id,
    }) ||
    request.todoist_url;
  await request.save();
  emitRequestEvent("merchant-request:updated", request);
  return { removed: false };
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

async function processTodoistWebhook(payload, deliveryId, config, deps = {}) {
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

    let request = await resolveRequestFromTask(data);
    let imported = false;
    if (!request && eventName.startsWith("item:")) {
      request = await importRequestFromTodoistTask(data, { ...deps, config, eventName });
      imported = !!request;
    }
    if (!request) {
      if (delivery) {
        delivery.processed = true;
        await delivery.save();
      }
      return { ignored: true };
    }

    if (eventName.startsWith("item:") && !imported) {
      await applyTaskUpdate(request, data, null, eventName);
    } else if (eventName.startsWith("note:") && !request.removed_at) {
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
  deadlineDateFromTask,
  hasLabelSnapshot,
  hasRequiredLabels,
  isTodoistImportedRequest,
  importRequestFromTodoistTask,
  isTaskCompleted,
  processTodoistWebhook,
  resolveRequestFromTask,
};
