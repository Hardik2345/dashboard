const crypto = require("crypto");
const MerchantRequest = require("../models/MerchantRequest");
const MerchantRequestEvent = require("../models/MerchantRequestEvent");
const TodoistUser = require("../models/TodoistUser");
const { appendEvent } = require("./events");
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
const { normalizeStatus } = require("./statusMapping");
const { getBrandConfig } = require("./brandProvisioning");
const { getVisibleStatuses, maskStatus, expandStatusFilter } = require("./statusVisibility");

function serializeRequest(doc, visibleStatuses = null) {
  const request = typeof doc.toObject === "function" ? doc.toObject() : doc;
  request.id = String(request._id);
  if (visibleStatuses) {
    request.status = maskStatus(request.status, visibleStatuses);
  }
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

function normalizeDueDate(value) {
  if (value === null || value === undefined) return "";
  const normalized = String(value).trim();
  if (!normalized) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const err = new Error("invalid_due_date");
    err.statusCode = 400;
    throw err;
  }
  return normalized;
}

async function createRequest(input, principal, deps) {
  assertPermission(principal, "requests_panel");
  const brandKey = normalizeBrandKey(input.brand_key || principal.brand_key);
  assertBrandAccess(principal, brandKey);
  if (input.due_date && !principal.isAuthor) {
    assertAuthor(principal);
  }
  const dueDate = normalizeDueDate(input.due_date);

  const request = await MerchantRequest.create({
    brand_key: brandKey,
    requester: {
      user_id: principal.user_id,
      email: principal.email,
      name: principal.name,
    },
    title: validateTitle(input.title),
    description: String(input.description || ""),
    category: String(input.category || ""),
    priority: input.priority || "normal",
    due_date: dueDate,
    status: "submitted",
    todoist_labels: ["Datum", "merchant-request", `brand:${brandKey}`],
    sync: {
      todoist_task_status: "pending",
      todoist_due_date_status: dueDate ? "pending" : "idle",
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
  const filter = {};
  let visibleStatuses = null;

  if (principal.isAuthor) {
    if (query.brand_key) filter.brand_key = normalizeBrandKey(query.brand_key);
  } else {
    const allowed = getAllowedBrands(principal);
    filter.brand_key = { $in: allowed };
    // Compute visibility for single-brand merchants (the common case)
    if (allowed.length === 1) {
      const brandConfig = await getBrandConfig(allowed[0]);
      visibleStatuses = getVisibleStatuses(brandConfig);
    }
  }

  if (query.status) {
    const rawStatus = normalizeStatus(query.status);
    if (visibleStatuses) {
      filter.status = { $in: expandStatusFilter(rawStatus, visibleStatuses) };
    } else {
      filter.status = rawStatus;
    }
  }

  if (query.assignee_id) filter["assignee.todoist_user_id"] = String(query.assignee_id);
  if (query.requester) filter["requester.email"] = String(query.requester);
  if (query.sync_state) {
    filter.$or = [
      { "sync.todoist_task_status": query.sync_state },
      { "sync.todoist_assignment_status": query.sync_state },
      { "sync.todoist_status_status": query.sync_state },
      { "sync.todoist_comment_status": query.sync_state },
    ];
  }

  const requests = await MerchantRequest.find(filter).sort({ updated_at: -1 }).limit(200).lean();
  return requests.map((r) => serializeRequest(r, visibleStatuses));
}

async function getRequestWithEvents(id, principal) {
  assertPermission(principal, "requests_panel");
  const request = await MerchantRequest.findById(id);
  if (!request || !canAccessBrand(principal, request.brand_key)) {
    const err = new Error("request_not_found");
    err.statusCode = 404;
    throw err;
  }

  let visibleStatuses = null;
  if (!principal.isAuthor) {
    const brandConfig = await getBrandConfig(request.brand_key);
    visibleStatuses = getVisibleStatuses(brandConfig);
  }

  const canViewTimeline = hasPermission(principal, "requests_timeline");
  const events = canViewTimeline
    ? await MerchantRequestEvent.find({ request_id: request._id }).sort({ created_at: 1 }).lean()
    : [];
  return {
    request: serializeRequest(request, visibleStatuses),
    events,
    timeline_hidden: !canViewTimeline,
  };
}

async function addComment(id, body, principal, deps) {
  assertPermission(principal, "requests_panel");
  const request = await MerchantRequest.findById(id);
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
  return MerchantRequest.findById(request._id);
}

async function updateStatus(id, body, principal, deps) {
  assertAuthor(principal);
  const status = normalizeStatus(body.status);
  const request = await MerchantRequest.findById(id);
  if (!request) {
    const err = new Error("request_not_found");
    err.statusCode = 404;
    throw err;
  }
  request.status = status;
  request.sync.todoist_status_status = "pending";
  request.sync.pending_status = status;
  if (["closed", "cancelled"].includes(status) && !request.closed_at) request.closed_at = new Date();
  await request.save();
  await appendEvent(request, "status_changed", "datum", { principal, data: { status } });
  const job = await enqueueSyncJob(request._id, "update_status", { status });
  emitRequestEvent("merchant-request:updated", request);
  await processJob(job, { todoistClient: deps.todoistClient, config: deps.config });
  return MerchantRequest.findById(request._id);
}

async function updateAssignee(id, body, principal, deps) {
  assertAuthor(principal);
  const todoistUserId = String(body.todoist_user_id || "").trim();
  if (!todoistUserId) {
    const err = new Error("todoist_user_id_required");
    err.statusCode = 400;
    throw err;
  }
  const request = await MerchantRequest.findById(id);
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
  return MerchantRequest.findById(request._id);
}

async function updateDueDate(id, body, principal, deps) {
  assertAuthor(principal);
  const dueDate = normalizeDueDate(body.due_date);
  const request = await MerchantRequest.findById(id);
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
  return MerchantRequest.findById(request._id);
}

module.exports = {
  addComment,
  createRequest,
  getRequestWithEvents,
  listRequests,
  normalizeDueDate,
  serializeRequest,
  updateAssignee,
  updateDueDate,
  updateStatus,
};
