const crypto = require("crypto");
const { CATEGORIES, DEFAULT_PRIORITY_CAPS, PRIORITIES } = require("../config");
const MerchantRequest = require("../models/MerchantRequest");
const MerchantRequestEvent = require("../models/MerchantRequestEvent");
const TodoistUser = require("../models/TodoistUser");
const { appendEvent } = require("./events");
const { normalizeTodoistTaskUrl } = require("./todoistLinks");
const {
  assertAuthor,
  assertBrandAccess,
  assertPermission,
  canAccessBrand,
  getAllowedBrands,
  hasPermission,
  normalizeBrandKey,
} = require("./permissions");
const { emitRequestEvent } = require("./realtime");
const { enqueueSyncJob, processJob } = require("./syncJobs");
const { normalizeStatus, normalizeStoredStatus } = require("./statusMapping");
const { getBrandConfig } = require("./brandProvisioning");
const { softRemoveRequest } = require("./requestLifecycle");

function serializeRequest(doc, { includeAssignee = true } = {}) {
  const request = typeof doc.toObject === "function" ? doc.toObject() : doc;
  request.id = String(request._id);
  request.status = normalizeStoredStatus(request.status);
  request.todoist_url = normalizeTodoistTaskUrl(request);
  if (!includeAssignee) delete request.assignee;
  return request;
}

function validateTitle(title) {
  const normalized = String(title || "").trim();
  if (!normalized) {
    const err = new Error("title_required");
    err.statusCode = 400;
    throw err;
  }
  return normalized;
}

function normalizeDateOnly(value, errorCode) {
  if (value === null || value === undefined) return "";
  const normalized = String(value).trim();
  if (!normalized) return "";
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    : null;
  if (
    !match ||
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) {
    const err = new Error(errorCode);
    err.statusCode = 400;
    throw err;
  }
  return normalized;
}

function normalizeDueDate(value) {
  return normalizeDateOnly(value, "invalid_due_date");
}

function normalizeDeadlineDate(value) {
  return normalizeDateOnly(value, "invalid_deadline_date");
}

function normalizePriority(value) {
  const normalized = String(value || "normal").trim().toLowerCase();
  if (!PRIORITIES.includes(normalized)) {
    const err = new Error("invalid_priority");
    err.statusCode = 400;
    throw err;
  }
  return normalized;
}

function normalizeCategory(value) {
  const normalized = String(value || "Feature Request").trim();
  if (!CATEGORIES.includes(normalized)) {
    const err = new Error("invalid_category");
    err.statusCode = 400;
    err.valid = CATEGORIES;
    throw err;
  }
  return normalized;
}

function findActiveRequestById(id) {
  return MerchantRequest.findOne({ _id: id, removed_at: null });
}

function normalizePriorityCaps(input = {}) {
  const caps = { ...DEFAULT_PRIORITY_CAPS };
  for (const priority of PRIORITIES) {
    if (input[priority] === undefined || input[priority] === null || input[priority] === "") continue;
    const value = Number(input[priority]);
    if (!Number.isInteger(value) || value < 0) {
      const err = new Error("invalid_priority_caps");
      err.statusCode = 400;
      throw err;
    }
    caps[priority] = value;
  }
  return caps;
}

function priorityCapsForConfig(brandConfig) {
  return normalizePriorityCaps(brandConfig?.priority_caps || DEFAULT_PRIORITY_CAPS);
}

async function assertPriorityCapAvailable(brandKey, priority) {
  const brandConfig = await getBrandConfig(brandKey);
  const caps = priorityCapsForConfig(brandConfig);
  const limit = caps[priority];
  if (limit === 0) {
    const err = new Error("priority_cap_reached");
    err.statusCode = 409;
    err.details = { priority, limit, active_count: 0 };
    throw err;
  }
  const activeCount = await MerchantRequest.countDocuments({
    brand_key: brandKey,
    priority,
    status: { $ne: "done" },
    removed_at: null,
  });
  if (activeCount >= limit) {
    const err = new Error("priority_cap_reached");
    err.statusCode = 409;
    err.details = { priority, limit, active_count: activeCount };
    throw err;
  }
}

async function createRequest(input, principal, deps) {
  assertPermission(principal, "requests_panel");
  const brandKey = normalizeBrandKey(input.brand_key || principal.brand_key);
  assertBrandAccess(principal, brandKey);
  if (input.due_date && !principal.isAuthor) {
    assertAuthor(principal);
  }
  if (input.deadline_date && !principal.isAuthor) {
    assertAuthor(principal);
  }
  const dueDate = normalizeDueDate(input.due_date);
  const deadlineDate = normalizeDeadlineDate(input.deadline_date);
  const priority = normalizePriority(input.priority);
  const category = normalizeCategory(input.category);
  await assertPriorityCapAvailable(brandKey, priority);

  const request = await MerchantRequest.create({
    brand_key: brandKey,
    requester: {
      user_id: principal.user_id,
      email: principal.email,
      name: principal.name,
    },
    title: validateTitle(input.title),
    description: String(input.description || ""),
    category,
    priority,
    due_date: dueDate,
    deadline_date: deadlineDate,
    status: "submitted",
    todoist_labels: ["Datum", "merchant-request", `brand:${brandKey}`],
    sync: {
      todoist_task_status: "pending",
      todoist_due_date_status: dueDate ? "pending" : "idle",
      todoist_deadline_status: deadlineDate ? "pending" : "idle",
    },
  });

  await appendEvent(request, "request_created", "datum", { principal });
  const job = await enqueueSyncJob(request._id, "create_task", {});
  emitRequestEvent("merchant-request:created", request);
  // processJob gates on brand config readiness and triggers provisioning if needed
  await processJob(job, { todoistClient: deps.todoistClient, config: deps.config });

  return MerchantRequest.findById(request._id);
}

async function listRequests(query, principal) {
  assertPermission(principal, "requests_panel");
  const filter = { removed_at: null };

  if (principal.isAuthor) {
    if (query.brand_key) filter.brand_key = normalizeBrandKey(query.brand_key);
  } else {
    const allowed = getAllowedBrands(principal);
    filter.brand_key = { $in: allowed };
  }

  if (query.status) {
    filter.status = normalizeStatus(query.status);
  }

  if (query.assignee_id) filter["assignee.todoist_user_id"] = String(query.assignee_id);
  if (query.requester) filter["requester.email"] = String(query.requester);
  if (query.sync_state) {
    filter.$or = [
      { "sync.todoist_task_status": query.sync_state },
      { "sync.todoist_assignment_status": query.sync_state },
      { "sync.todoist_status_status": query.sync_state },
      { "sync.todoist_comment_status": query.sync_state },
      { "sync.todoist_due_date_status": query.sync_state },
      { "sync.todoist_deadline_status": query.sync_state },
    ];
  }

  const requests = await MerchantRequest.find(filter).sort({ updated_at: -1 }).limit(200).lean();
  return requests.map((r) => serializeRequest(r, { includeAssignee: principal.isAuthor }));
}

async function getRequestWithEvents(id, principal) {
  assertPermission(principal, "requests_panel");
  const request = await findActiveRequestById(id);
  if (!request || !canAccessBrand(principal, request.brand_key)) {
    const err = new Error("request_not_found");
    err.statusCode = 404;
    throw err;
  }

  const canViewTimeline = hasPermission(principal, "requests_timeline");
  const rawEvents = canViewTimeline
    ? await MerchantRequestEvent.find({ request_id: request._id }).sort({ created_at: 1 }).lean()
    : [];
  const events = principal.isAuthor ? rawEvents : rawEvents.map(sanitizeMerchantEvent);
  return {
    request: serializeRequest(request, { includeAssignee: principal.isAuthor }),
    events,
    timeline_hidden: !canViewTimeline,
  };
}

function sanitizeMerchantEvent(event) {
  if (event.type !== "assignment_changed" && event.type !== "assignment_synced") return event;
  return {
    ...event,
    actor: event.source === "todoist" ? { name: "Todoist" } : event.actor,
    data: {},
    message: event.message || "Request assigned",
  };
}

async function addComment(id, body, principal, deps) {
  assertPermission(principal, "requests_panel");
  const request = await findActiveRequestById(id);
  if (!request || !canAccessBrand(principal, request.brand_key)) {
    const err = new Error("request_not_found");
    err.statusCode = 404;
    throw err;
  }
  const content = String(body.content || body.message || "").trim();
  if (!content) {
    const err = new Error("comment_required");
    err.statusCode = 400;
    throw err;
  }
  const localCommentId = crypto.randomUUID();
  await appendEvent(request, "comment_added", "datum", {
    principal,
    message: content,
    local_comment_id: localCommentId,
  });
  request.sync.todoist_comment_status = "pending";
  await request.save();
  const job = await enqueueSyncJob(request._id, "create_comment", { content, local_comment_id: localCommentId });
  emitRequestEvent("merchant-request:commented", request, { comment: { content, local_comment_id: localCommentId } });
  await processJob(job, { todoistClient: deps.todoistClient, config: deps.config });
  return findActiveRequestById(request._id);
}

async function updateStatus(id, body, principal, deps) {
  assertAuthor(principal);
  const status = normalizeStatus(body.status);
  const request = await findActiveRequestById(id);
  if (!request) {
    const err = new Error("request_not_found");
    err.statusCode = 404;
    throw err;
  }
  request.status = status;
  request.sync.todoist_status_status = "pending";
  request.sync.pending_status = status;
  if (status === "done" && !request.closed_at) request.closed_at = new Date();
  await request.save();
  await appendEvent(request, "status_changed", "datum", { principal, data: { status } });
  const job = await enqueueSyncJob(request._id, status === "done" ? "complete_task" : "update_status", { status });
  emitRequestEvent("merchant-request:updated", request);
  await processJob(job, { todoistClient: deps.todoistClient, config: deps.config });
  return findActiveRequestById(request._id);
}

async function updateAssignee(id, body, principal, deps) {
  assertAuthor(principal);
  const todoistUserId = String(body.todoist_user_id || "").trim();
  if (!todoistUserId) {
    const err = new Error("todoist_user_id_required");
    err.statusCode = 400;
    throw err;
  }
  const request = await findActiveRequestById(id);
  if (!request) {
    const err = new Error("request_not_found");
    err.statusCode = 404;
    throw err;
  }
  const user = await TodoistUser.findOne({ todoist_user_id: todoistUserId }).lean();
  request.assignee = {
    todoist_user_id: todoistUserId,
    name: user?.name || body.name || "",
    email: user?.email || body.email || "",
    unmapped: !user,
  };
  if (request.status !== "done") {
    request.status = "assigned";
    request.sync.todoist_status_status = "pending";
    request.sync.pending_status = "assigned";
  }
  request.sync.todoist_assignment_status = "pending";
  request.sync.pending_assignment_user_id = todoistUserId;
  await request.save();
  await appendEvent(request, "assignment_changed", "datum", {
    principal,
    data: { todoist_user_id: todoistUserId },
  });
  const job = await enqueueSyncJob(request._id, "update_assignment", {
    todoist_user_id: todoistUserId,
    name: body.name || "",
    email: body.email || "",
  });
  emitRequestEvent("merchant-request:updated", request);
  await processJob(job, { todoistClient: deps.todoistClient, config: deps.config });
  return findActiveRequestById(request._id);
}

async function updateDueDate(id, body, principal, deps) {
  assertAuthor(principal);
  const dueDate = normalizeDueDate(body.due_date);
  const request = await findActiveRequestById(id);
  if (!request) {
    const err = new Error("request_not_found");
    err.statusCode = 404;
    throw err;
  }

  request.due_date = dueDate;
  request.sync.todoist_due_date_status = "pending";
  request.sync.pending_due_date = dueDate;
  await request.save();
  await appendEvent(request, "due_date_changed", "datum", {
    principal,
    data: { due_date: dueDate },
  });
  const job = await enqueueSyncJob(request._id, "update_due_date", { due_date: dueDate });
  emitRequestEvent("merchant-request:updated", request);
  await processJob(job, { todoistClient: deps.todoistClient, config: deps.config });
  return findActiveRequestById(request._id);
}

async function updateDeadline(id, body, principal, deps) {
  assertAuthor(principal);
  const deadlineDate = normalizeDeadlineDate(body.deadline_date);
  const request = await findActiveRequestById(id);
  if (!request) {
    const err = new Error("request_not_found");
    err.statusCode = 404;
    throw err;
  }

  request.deadline_date = deadlineDate;
  request.sync.todoist_deadline_status = "pending";
  request.sync.pending_deadline_date = deadlineDate;
  await request.save();
  await appendEvent(request, "deadline_date_changed", "datum", {
    principal,
    data: { deadline_date: deadlineDate },
  });
  const job = await enqueueSyncJob(request._id, "update_deadline", { deadline_date: deadlineDate });
  emitRequestEvent("merchant-request:updated", request);
  await processJob(job, { todoistClient: deps.todoistClient, config: deps.config });
  return findActiveRequestById(request._id);
}

async function removeRequest(id, principal) {
  assertAuthor(principal);
  const request = await MerchantRequest.findById(id);
  if (!request) {
    const err = new Error("request_not_found");
    err.statusCode = 404;
    throw err;
  }
  await softRemoveRequest(request, {
    reason: "author_removed",
    source: "datum",
    principal,
  });
  return request;
}

module.exports = {
  addComment,
  assertPriorityCapAvailable,
  createRequest,
  getRequestWithEvents,
  listRequests,
  normalizeCategory,
  normalizeDueDate,
  normalizeDeadlineDate,
  normalizePriority,
  normalizePriorityCaps,
  priorityCapsForConfig,
  removeRequest,
  serializeRequest,
  updateAssignee,
  updateDueDate,
  updateDeadline,
  updateStatus,
};
