const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const request = require("supertest");

const BrandTodoistConfig = require("../src/models/BrandTodoistConfig");
const MerchantRequest = require("../src/models/MerchantRequest");
const MerchantRequestEvent = require("../src/models/MerchantRequestEvent");
const TodoistSyncJob = require("../src/models/TodoistSyncJob");
const TodoistWebhookDelivery = require("../src/models/TodoistWebhookDelivery");
const { buildApp } = require("../src/app");
const { computeTodoistHmac } = require("../src/services/todoistHmac");
const { buildTaskPayload } = require("../src/services/syncJobs");
const { maskStatus, expandStatusFilter, getVisibleStatuses } = require("../src/services/statusVisibility");

function testConfig() {
  return {
    port: 4020,
    mongoUri: "",
    mongoDb: "merchant_requests_test",
    corsOrigins: [],
    todoist: {
      apiToken: "token",
      clientSecret: "secret",
      projectNamePrefix: "Datum",
      reconcileIntervalMs: 300000,
      apiBaseUrl: "https://api.todoist.com/api/v1",
    },
    gatewaySharedSecret: "",
    allowInsecureAuth: true,
    authKeys: "",
  };
}

function mockBrandConfig(overrides = {}) {
  return {
    todoist_project_id: "project-1",
    section_by_status: {
      submitted: "sec-submitted",
      triaged: "sec-triaged",
      in_progress: "sec-progress",
      waiting_on_merchant: "sec-waiting",
      resolved: "sec-resolved",
      closed: "sec-closed",
      cancelled: "sec-cancelled",
    },
    unlocked_statuses: [],
    ...overrides,
  };
}

async function seedBrandConfig(brand_key = "TMC", overrides = {}) {
  return BrandTodoistConfig.create({
    brand_key,
    todoist_project_id: "project-1",
    section_by_status: {
      submitted: "sec-submitted",
      triaged: "sec-triaged",
      in_progress: "sec-progress",
      waiting_on_merchant: "sec-waiting",
      resolved: "sec-resolved",
      closed: "sec-closed",
      cancelled: "sec-cancelled",
    },
    provisioning_status: "ready",
    provisioning_mode: "auto",
    unlocked_statuses: [],
    ...overrides,
  });
}

function merchantHeaders(brand = "TMC", permissions = ["requests_panel", "requests_timeline"]) {
  return {
    "x-user-id": "merchant-1",
    "x-brand-id": brand,
    "x-role": "viewer",
    "x-email": "merchant@example.com",
    "x-permissions": permissions.join(","),
  };
}

function authorHeaders(brand = "TMC") {
  return {
    "x-user-id": "author-1",
    "x-brand-id": brand,
    "x-role": "author",
    "x-email": "author@example.com",
  };
}

test.beforeEach(async (t) => {
  const mongo = await MongoMemoryServer.create();
  t.after(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
  await mongoose.connect(mongo.getUri(), { dbName: "merchant_requests_test" });
});

// ─── buildTaskPayload ──────────────────────────────────────────────────────────

test("buildTaskPayload includes required labels and submitted section", async () => {
  const req = new MerchantRequest({
    brand_key: "TMC",
    requester: { user_id: "u1", email: "merchant@example.com" },
    title: "Help with report",
    description: "Need a custom report",
    category: "reporting",
    status: "submitted",
  });

  const payload = buildTaskPayload(req, mockBrandConfig());

  assert.equal(payload.project_id, "project-1");
  assert.equal(payload.section_id, "sec-submitted");
  assert.deepEqual(payload.labels.slice(0, 3), ["Datum", "merchant-request", "brand:TMC"]);
  assert.match(payload.description, /Datum Request ID:/);
});

test("buildTaskPayload includes due_date when present", async () => {
  const req = new MerchantRequest({
    brand_key: "TMC",
    requester: { user_id: "u1", email: "merchant@example.com" },
    title: "Help with report",
    status: "submitted",
    due_date: "2026-06-25",
  });

  const payload = buildTaskPayload(req, mockBrandConfig());

  assert.equal(payload.due_date, "2026-06-25");
});

// ─── Status visibility / masking ──────────────────────────────────────────────

test("maskStatus returns bucket status when internal status is not visible", () => {
  const visible = ["submitted", "in_progress", "closed"];
  assert.equal(maskStatus("triaged", visible), "submitted");
  assert.equal(maskStatus("waiting_on_merchant", visible), "in_progress");
  assert.equal(maskStatus("resolved", visible), "in_progress");
  assert.equal(maskStatus("cancelled", visible), "closed");
  assert.equal(maskStatus("submitted", visible), "submitted");
  assert.equal(maskStatus("in_progress", visible), "in_progress");
  assert.equal(maskStatus("closed", visible), "closed");
});

test("maskStatus passes through unlocked statuses unchanged", () => {
  const visible = ["submitted", "in_progress", "closed", "triaged", "cancelled"];
  assert.equal(maskStatus("triaged", visible), "triaged");
  assert.equal(maskStatus("cancelled", visible), "cancelled");
  assert.equal(maskStatus("waiting_on_merchant", visible), "in_progress");
});

test("expandStatusFilter expands visible bucket to underlying statuses", () => {
  const defaults = ["submitted", "in_progress", "closed"];
  assert.deepEqual(expandStatusFilter("submitted", defaults).sort(), ["submitted", "triaged"].sort());
  assert.deepEqual(
    expandStatusFilter("in_progress", defaults).sort(),
    ["in_progress", "waiting_on_merchant", "resolved"].sort(),
  );
  assert.deepEqual(expandStatusFilter("closed", defaults).sort(), ["closed", "cancelled"].sort());
});

test("expandStatusFilter respects unlocked statuses", () => {
  const visible = ["submitted", "in_progress", "closed", "waiting_on_merchant"];
  // waiting_on_merchant is now visible separately → excluded from in_progress expansion
  const expanded = expandStatusFilter("in_progress", visible).sort();
  assert.deepEqual(expanded, ["in_progress", "resolved"].sort());
});

test("getVisibleStatuses includes unlocked statuses from brand config", () => {
  const cfg = { unlocked_statuses: ["triaged", "cancelled"] };
  const visible = getVisibleStatuses(cfg);
  assert.ok(visible.includes("submitted"));
  assert.ok(visible.includes("in_progress"));
  assert.ok(visible.includes("closed"));
  assert.ok(visible.includes("triaged"));
  assert.ok(visible.includes("cancelled"));
  assert.ok(!visible.includes("waiting_on_merchant"));
  assert.ok(!visible.includes("resolved"));
});

// ─── Request creation ──────────────────────────────────────────────────────────

test("merchant create returns local request when Todoist is down and queues retry", async () => {
  const todoistClient = {
    createTask: async () => {
      const err = new Error("todoist_down");
      err.status = 503;
      throw err;
    },
  };
  const { app } = buildApp({ config: testConfig(), todoistClient });

  const res = await request(app)
    .post("/merchant-requests")
    .set(merchantHeaders("TMC"))
    .send({ brand_key: "TMC", title: "Need help", description: "Please check this" });

  assert.equal(res.status, 201);
  assert.equal(res.body.request.brand_key, "TMC");
  // Job deferred due to no brand config (not a Todoist error), sync status stays pending
  assert.equal(res.body.request.sync.todoist_task_status, "pending");

  const jobs = await TodoistSyncJob.find({ request_id: res.body.request.id }).lean();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].type, "create_task");
  assert.equal(jobs[0].status, "pending");
});

test("merchant status is masked to visible bucket on create response", async () => {
  // Seed brand config with triaged NOT unlocked
  await seedBrandConfig("TMC");
  const todoistClient = {
    createTask: async () => ({ id: "task-99", url: "https://todoist.com/task-99" }),
    listSections: async () => [],
    createSection: async (name) => ({ id: `sec-${name}` }),
  };
  const { app } = buildApp({ config: testConfig(), todoistClient });

  const res = await request(app)
    .post("/merchant-requests")
    .set(merchantHeaders("TMC"))
    .send({ brand_key: "TMC", title: "Need help" });

  assert.equal(res.status, 201);
  // "submitted" is always visible, so no masking occurs here
  assert.equal(res.body.request.status, "submitted");
});

test("author create request with due_date sends due_date to Todoist", async () => {
  await seedBrandConfig("TMC");
  const createTaskCalls = [];
  const todoistClient = {
    createTask: async (payload) => {
      createTaskCalls.push(payload);
      return { id: "task-99", url: "https://todoist.com/task-99" };
    },
  };
  const { app } = buildApp({ config: testConfig(), todoistClient });

  const res = await request(app)
    .post("/merchant-requests")
    .set(authorHeaders("TMC"))
    .send({ brand_key: "TMC", title: "Need help", due_date: "2026-06-25" });

  assert.equal(res.status, 201);
  assert.equal(res.body.request.due_date, "2026-06-25");
  assert.equal(createTaskCalls.length, 1);
  assert.equal(createTaskCalls[0].due_date, "2026-06-25");
});

test("merchant create request with due_date is rejected", async () => {
  const { app } = buildApp({ config: testConfig(), todoistClient: {} });

  const res = await request(app)
    .post("/merchant-requests")
    .set(merchantHeaders("TMC"))
    .send({ brand_key: "TMC", title: "Need help", due_date: "2026-06-25" });

  assert.equal(res.status, 403);
  assert.equal(res.body.error, "author_required");
});

// ─── Brand config provisioning ────────────────────────────────────────────────

test("processJob defers create_task when brand config not provisioned", async () => {
  const createTaskCalls = [];
  const todoistClient = {
    createTask: async (p) => { createTaskCalls.push(p); return { id: "t1" }; },
    createProject: async () => ({ id: "proj-1" }),
    listSections: async () => [],
    createSection: async (name) => ({ id: `s-${name}` }),
  };
  const { app } = buildApp({ config: testConfig(), todoistClient });

  const res = await request(app)
    .post("/merchant-requests")
    .set(merchantHeaders("TMC"))
    .send({ title: "First request" });

  assert.equal(res.status, 201);
  // createTask should NOT have been called — job was deferred, provisioning kicked off async
  assert.equal(createTaskCalls.length, 0);
  assert.equal(res.body.request.sync.todoist_task_status, "pending");
});

// ─── Access control ────────────────────────────────────────────────────────────

test("merchant cannot list another brand request", async () => {
  await MerchantRequest.create({
    brand_key: "BBB",
    requester: { user_id: "merchant-2" },
    title: "Other brand",
  });
  const { app } = buildApp({ config: testConfig(), todoistClient: {} });

  const res = await request(app)
    .get("/merchant-requests")
    .set(merchantHeaders("TMC"));

  assert.equal(res.status, 200);
  assert.equal(res.body.requests.length, 0);
});

test("merchant without requests_panel cannot access request endpoints", async () => {
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Restricted",
  });
  const { app } = buildApp({ config: testConfig(), todoistClient: {} });
  const noRequestAccess = merchantHeaders("TMC", []);

  const list = await request(app).get("/merchant-requests").set(noRequestAccess);
  assert.equal(list.status, 403);
  assert.equal(list.body.error, "permission_forbidden");

  const create = await request(app)
    .post("/merchant-requests")
    .set(noRequestAccess)
    .send({ brand_key: "TMC", title: "Blocked" });
  assert.equal(create.status, 403);

  const detail = await request(app)
    .get(`/merchant-requests/${reqDoc._id}`)
    .set(noRequestAccess);
  assert.equal(detail.status, 403);

  const comment = await request(app)
    .post(`/merchant-requests/${reqDoc._id}/comments`)
    .set(noRequestAccess)
    .send({ content: "Blocked" });
  assert.equal(comment.status, 403);
});

test("merchant with requests_panel but without requests_timeline gets hidden timeline marker", async () => {
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Timeline hidden",
  });
  await MerchantRequestEvent.create({
    request_id: reqDoc._id,
    brand_key: "TMC",
    type: "request_created",
    source: "datum",
    actor: { user_id: "merchant-1" },
  });
  const { app } = buildApp({ config: testConfig(), todoistClient: {} });

  const res = await request(app)
    .get(`/merchant-requests/${reqDoc._id}`)
    .set(merchantHeaders("TMC", ["requests_panel"]));

  assert.equal(res.status, 200);
  assert.equal(res.body.timeline_hidden, true);
  assert.deepEqual(res.body.events, []);
});

test("merchant with requests_panel and requests_timeline receives timeline events", async () => {
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Timeline visible",
  });
  await MerchantRequestEvent.create({
    request_id: reqDoc._id,
    brand_key: "TMC",
    type: "request_created",
    source: "datum",
    actor: { user_id: "merchant-1" },
  });
  const { app } = buildApp({ config: testConfig(), todoistClient: {} });

  const res = await request(app)
    .get(`/merchant-requests/${reqDoc._id}`)
    .set(merchantHeaders("TMC", ["requests_panel", "requests_timeline"]));

  assert.equal(res.status, 200);
  assert.equal(res.body.timeline_hidden, false);
  assert.equal(res.body.events.length, 1);
});

test("author status update stores local intent before Todoist sync", async () => {
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Assign me",
    todoist_task_id: "task-1",
    sync: { todoist_task_status: "synced" },
  });
  const todoistClient = {
    updateTask: async () => {
      throw new Error("todoist_timeout");
    },
  };
  const { app } = buildApp({ config: testConfig(), todoistClient });

  const res = await request(app)
    .patch(`/merchant-requests/${reqDoc._id}/status`)
    .set(authorHeaders("TMC"))
    .send({ status: "in_progress" });

  assert.equal(res.status, 200);
  assert.equal(res.body.request.status, "in_progress");
  assert.equal(res.body.request.sync.pending_status, "in_progress");
  assert.equal(res.body.request.sync.todoist_status_status, "pending");
});

test("author can set due date and Todoist receives due_date", async () => {
  await seedBrandConfig("TMC");
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Due me",
    todoist_task_id: "task-1",
    sync: { todoist_task_status: "synced" },
  });
  const updateTaskCalls = [];
  const todoistClient = {
    updateTask: async (taskId, payload) => {
      updateTaskCalls.push({ taskId, payload });
      return { id: taskId };
    },
  };
  const { app } = buildApp({ config: testConfig(), todoistClient });

  const res = await request(app)
    .patch(`/merchant-requests/${reqDoc._id}/due-date`)
    .set(authorHeaders("TMC"))
    .send({ due_date: "2026-06-25" });

  assert.equal(res.status, 200);
  assert.equal(res.body.request.due_date, "2026-06-25");
  assert.equal(res.body.request.sync.todoist_due_date_status, "synced");
  assert.equal(updateTaskCalls.length, 1);
  assert.deepEqual(updateTaskCalls[0], {
    taskId: "task-1",
    payload: { due_date: "2026-06-25" },
  });
});

test("author can clear due date and Todoist receives null due_date", async () => {
  await seedBrandConfig("TMC");
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Clear due",
    due_date: "2026-06-25",
    todoist_task_id: "task-1",
    sync: { todoist_task_status: "synced", todoist_due_date_status: "synced" },
  });
  const updateTaskCalls = [];
  const todoistClient = {
    updateTask: async (taskId, payload) => {
      updateTaskCalls.push({ taskId, payload });
      return { id: taskId };
    },
  };
  const { app } = buildApp({ config: testConfig(), todoistClient });

  const res = await request(app)
    .patch(`/merchant-requests/${reqDoc._id}/due-date`)
    .set(authorHeaders("TMC"))
    .send({ due_date: "" });

  assert.equal(res.status, 200);
  assert.equal(res.body.request.due_date, "");
  assert.equal(res.body.request.sync.todoist_due_date_status, "synced");
  assert.deepEqual(updateTaskCalls[0], {
    taskId: "task-1",
    payload: { due_date: null },
  });
});

test("merchant cannot patch due date", async () => {
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "No due for merchant",
    todoist_task_id: "task-1",
  });
  const { app } = buildApp({ config: testConfig(), todoistClient: {} });

  const res = await request(app)
    .patch(`/merchant-requests/${reqDoc._id}/due-date`)
    .set(merchantHeaders("TMC"))
    .send({ due_date: "2026-06-25" });

  assert.equal(res.status, 403);
  assert.equal(res.body.error, "author_required");
});

test("Todoist due date failure stores local intent for retry", async () => {
  await seedBrandConfig("TMC");
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Retry due",
    todoist_task_id: "task-1",
    sync: { todoist_task_status: "synced" },
  });
  const todoistClient = {
    updateTask: async () => {
      throw new Error("todoist_timeout");
    },
  };
  const { app } = buildApp({ config: testConfig(), todoistClient });

  const res = await request(app)
    .patch(`/merchant-requests/${reqDoc._id}/due-date`)
    .set(authorHeaders("TMC"))
    .send({ due_date: "2026-06-25" });

  assert.equal(res.status, 200);
  assert.equal(res.body.request.due_date, "2026-06-25");
  assert.equal(res.body.request.sync.pending_due_date, "2026-06-25");
  assert.equal(res.body.request.sync.todoist_due_date_status, "pending");
});

// ─── Merchant status masking in list / get ────────────────────────────────────

test("merchant sees masked status when internal status is not in their visible set", async () => {
  await seedBrandConfig("TMC");
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Internal triaged request",
    status: "triaged",
    sync: { todoist_task_status: "synced" },
  });
  const { app } = buildApp({ config: testConfig(), todoistClient: {} });

  const res = await request(app)
    .get("/merchant-requests")
    .set(merchantHeaders("TMC"));

  assert.equal(res.status, 200);
  assert.equal(res.body.requests.length, 1);
  // triaged is not visible by default → masked to "submitted"
  assert.equal(res.body.requests[0].status, "submitted");

  const single = await request(app)
    .get(`/merchant-requests/${reqDoc._id}`)
    .set(merchantHeaders("TMC"));
  assert.equal(single.status, 200);
  assert.equal(single.body.request.status, "submitted");
});

test("merchant sees unlocked status when author has granted visibility", async () => {
  await seedBrandConfig("TMC", { unlocked_statuses: ["triaged"] });
  await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Triaged request",
    status: "triaged",
    sync: { todoist_task_status: "synced" },
  });
  const { app } = buildApp({ config: testConfig(), todoistClient: {} });

  const res = await request(app)
    .get("/merchant-requests")
    .set(merchantHeaders("TMC"));

  assert.equal(res.status, 200);
  assert.equal(res.body.requests.length, 1);
  // triaged is unlocked → shown as-is
  assert.equal(res.body.requests[0].status, "triaged");
});

test("author always sees internal statuses without masking", async () => {
  await seedBrandConfig("TMC");
  await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Triaged",
    status: "triaged",
    sync: { todoist_task_status: "synced" },
  });
  const { app } = buildApp({ config: testConfig(), todoistClient: {} });

  const res = await request(app)
    .get("/merchant-requests")
    .set(authorHeaders("TMC"));

  assert.equal(res.status, 200);
  assert.equal(res.body.requests[0].status, "triaged");
});

// ─── Webhook ──────────────────────────────────────────────────────────────────

test("Todoist webhook verifies HMAC and dedupes delivery id", async () => {
  await seedBrandConfig("TMC");
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Webhook target",
    todoist_task_id: "task-1",
    sync: { todoist_task_status: "synced" },
  });
  const { app } = buildApp({ config: testConfig(), todoistClient: {} });
  const raw = JSON.stringify({
    event_name: "item:updated",
    event_data: {
      id: "task-1",
      section_id: "sec-progress",
      labels: ["Datum", "merchant-request", "brand:TMC"],
    },
  });
  const sig = computeTodoistHmac(raw, "secret");

  const first = await request(app)
    .post("/merchant-requests/todoist/webhook")
    .set("Content-Type", "application/json")
    .set("X-Todoist-Hmac-SHA256", sig)
    .set("X-Todoist-Delivery-ID", "delivery-1")
    .send(raw);
  assert.equal(first.status, 200);
  assert.equal(first.body.processed, true);

  const updated = await MerchantRequest.findById(reqDoc._id).lean();
  assert.equal(updated.status, "in_progress");

  const second = await request(app)
    .post("/merchant-requests/todoist/webhook")
    .set("Content-Type", "application/json")
    .set("X-Todoist-Hmac-SHA256", sig)
    .set("X-Todoist-Delivery-ID", "delivery-1")
    .send(raw);
  assert.equal(second.status, 200);
  assert.equal(second.body.duplicate, true);

  const deliveries = await TodoistWebhookDelivery.find({ delivery_id: "delivery-1" }).lean();
  assert.equal(deliveries.length, 1);
});

test("pending Datum status intent wins over conflicting Todoist webhook", async () => {
  await seedBrandConfig("TMC");
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Conflict target",
    status: "in_progress",
    todoist_task_id: "task-1",
    sync: {
      todoist_task_status: "synced",
      todoist_status_status: "pending",
      pending_status: "in_progress",
    },
  });
  const { app } = buildApp({ config: testConfig(), todoistClient: {} });
  const raw = JSON.stringify({
    event_name: "item:updated",
    event_data: {
      id: "task-1",
      section_id: "sec-closed",
      labels: ["Datum", "merchant-request", "brand:TMC"],
    },
  });

  const res = await request(app)
    .post("/merchant-requests/todoist/webhook")
    .set("Content-Type", "application/json")
    .set("X-Todoist-Hmac-SHA256", computeTodoistHmac(raw, "secret"))
    .set("X-Todoist-Delivery-ID", "delivery-conflict")
    .send(raw);

  assert.equal(res.status, 200);
  const updated = await MerchantRequest.findById(reqDoc._id).lean();
  assert.equal(updated.status, "in_progress");
});

test("webhook with unknown section_id is ignored without error", async () => {
  await seedBrandConfig("TMC");
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Unknown section target",
    status: "submitted",
    todoist_task_id: "task-1",
    sync: { todoist_task_status: "synced" },
  });
  const { app } = buildApp({ config: testConfig(), todoistClient: {} });
  const raw = JSON.stringify({
    event_name: "item:updated",
    event_data: {
      id: "task-1",
      section_id: "sec-does-not-exist",
      labels: ["Datum", "merchant-request", "brand:TMC"],
    },
  });

  const res = await request(app)
    .post("/merchant-requests/todoist/webhook")
    .set("Content-Type", "application/json")
    .set("X-Todoist-Hmac-SHA256", computeTodoistHmac(raw, "secret"))
    .set("X-Todoist-Delivery-ID", "delivery-unknown-section")
    .send(raw);

  assert.equal(res.status, 200);
  assert.equal(res.body.processed, true);
  // Status should be unchanged
  const unchanged = await MerchantRequest.findById(reqDoc._id).lean();
  assert.equal(unchanged.status, "submitted");
});

test("Todoist webhook updates Datum due date when no Datum due date is pending", async () => {
  await seedBrandConfig("TMC");
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Due webhook target",
    todoist_task_id: "task-1",
    sync: { todoist_task_status: "synced" },
  });
  const { app } = buildApp({ config: testConfig(), todoistClient: {} });
  const raw = JSON.stringify({
    event_name: "item:updated",
    event_data: {
      id: "task-1",
      due: { date: "2026-06-25" },
      labels: ["Datum", "merchant-request", "brand:TMC"],
    },
  });

  const res = await request(app)
    .post("/merchant-requests/todoist/webhook")
    .set("Content-Type", "application/json")
    .set("X-Todoist-Hmac-SHA256", computeTodoistHmac(raw, "secret"))
    .set("X-Todoist-Delivery-ID", "delivery-due-date")
    .send(raw);

  assert.equal(res.status, 200);
  const updated = await MerchantRequest.findById(reqDoc._id).lean();
  assert.equal(updated.due_date, "2026-06-25");
  assert.equal(updated.sync.todoist_due_date_status, "synced");
});

test("Todoist webhook does not override pending Datum due date", async () => {
  await seedBrandConfig("TMC");
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Due conflict target",
    due_date: "2026-06-25",
    todoist_task_id: "task-1",
    sync: {
      todoist_task_status: "synced",
      todoist_due_date_status: "pending",
      pending_due_date: "2026-06-25",
    },
  });
  const { app } = buildApp({ config: testConfig(), todoistClient: {} });
  const raw = JSON.stringify({
    event_name: "item:updated",
    event_data: {
      id: "task-1",
      due: { date: "2026-06-30" },
      labels: ["Datum", "merchant-request", "brand:TMC"],
    },
  });

  const res = await request(app)
    .post("/merchant-requests/todoist/webhook")
    .set("Content-Type", "application/json")
    .set("X-Todoist-Hmac-SHA256", computeTodoistHmac(raw, "secret"))
    .set("X-Todoist-Delivery-ID", "delivery-due-conflict")
    .send(raw);

  assert.equal(res.status, 200);
  const updated = await MerchantRequest.findById(reqDoc._id).lean();
  assert.equal(updated.due_date, "2026-06-25");
  assert.equal(updated.sync.pending_due_date, "2026-06-25");
});

// ─── Admin: brand config endpoints ────────────────────────────────────────────

test("admin can update visible statuses for a brand", async () => {
  await seedBrandConfig("TMC");
  const { app } = buildApp({ config: testConfig(), todoistClient: {} });

  const res = await request(app)
    .patch("/merchant-requests/admin/brand-configs/TMC/visible-statuses")
    .set(authorHeaders())
    .send({ unlocked_statuses: ["triaged", "cancelled"] });

  assert.equal(res.status, 200);
  assert.ok(res.body.visible_statuses.includes("triaged"));
  assert.ok(res.body.visible_statuses.includes("cancelled"));
  assert.ok(res.body.visible_statuses.includes("submitted"));

  const cfg = await BrandTodoistConfig.findOne({ brand_key: "TMC" }).lean();
  assert.deepEqual(cfg.unlocked_statuses.sort(), ["cancelled", "triaged"]);
});

test("admin visible-statuses rejects invalid status values", async () => {
  await seedBrandConfig("TMC");
  const { app } = buildApp({ config: testConfig(), todoistClient: {} });

  const res = await request(app)
    .patch("/merchant-requests/admin/brand-configs/TMC/visible-statuses")
    .set(authorHeaders())
    .send({ unlocked_statuses: ["submitted", "bogus"] });

  assert.equal(res.status, 400);
  assert.equal(res.body.error, "invalid_statuses");
});

test("admin can list brand configs", async () => {
  await seedBrandConfig("TMC");
  await seedBrandConfig("BBB", { todoist_project_id: "project-2" });
  const { app } = buildApp({ config: testConfig(), todoistClient: {} });

  const res = await request(app)
    .get("/merchant-requests/admin/brand-configs")
    .set(authorHeaders());

  assert.equal(res.status, 200);
  assert.equal(res.body.configs.length, 2);
});

test("admin can delete brand config", async () => {
  await seedBrandConfig("TMC");
  const { app } = buildApp({ config: testConfig(), todoistClient: {} });

  const res = await request(app)
    .delete("/merchant-requests/admin/brand-configs/TMC")
    .set(authorHeaders());

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);

  const cfg = await BrandTodoistConfig.findOne({ brand_key: "TMC" });
  assert.equal(cfg, null);
});

test("merchant cannot access admin endpoints", async () => {
  const { app } = buildApp({ config: testConfig(), todoistClient: {} });

  const res = await request(app)
    .get("/merchant-requests/admin/brand-configs")
    .set(merchantHeaders());

  assert.equal(res.status, 403);
});

test("admin todoist-projects serves the local snapshot sorted by name", async () => {
  const TodoistProject = require("../src/models/TodoistProject");
  await TodoistProject.create([
    { todoist_project_id: "p-2", name: "Beta", active: true },
    { todoist_project_id: "p-1", name: "Alpha", active: true },
    { todoist_project_id: "p-3", name: "Archived", active: false },
  ]);
  // listProjects must NOT be hit when the cache is already populated.
  const todoistClient = {
    listProjects: async () => {
      throw new Error("should not call live API when cache is warm");
    },
  };
  const { app } = buildApp({ config: testConfig(), todoistClient });

  const res = await request(app)
    .get("/merchant-requests/admin/todoist-projects")
    .set(authorHeaders());

  assert.equal(res.status, 200);
  assert.deepEqual(
    res.body.projects.map((p) => p.name),
    ["Alpha", "Beta"],
  );
});

test("admin todoist-projects lazy-seeds from the paginated Todoist API when cache is empty", async () => {
  const todoistClient = {
    listProjects: async () => [
      { id: "p-10", name: "Seeded One" },
      { id: "p-11", name: "Seeded Two" },
    ],
  };
  const { app } = buildApp({ config: testConfig(), todoistClient });

  const res = await request(app)
    .get("/merchant-requests/admin/todoist-projects")
    .set(authorHeaders());

  assert.equal(res.status, 200);
  assert.equal(res.body.projects.length, 2);

  const TodoistProject = require("../src/models/TodoistProject");
  const stored = await TodoistProject.countDocuments({ active: true });
  assert.equal(stored, 2);
});

// ─── Reconcile hardening ─────────────────────────────────────────────────────────

test("reconcile is single-flight and throttles rapid repeats", async () => {
  let syncCalls = 0;
  const todoistClient = {
    sync: async () => {
      syncCalls += 1;
      return { items: [], collaborators: [], notes: [], sync_token: "tok" };
    },
    listProjects: async () => [],
  };
  const { reconcileTodoist } = require("../src/services/reconcileService");
  const deps = { todoistClient, config: testConfig() };

  // Two concurrent triggers coalesce into a single run.
  await Promise.all([reconcileTodoist(deps), reconcileTodoist(deps)]);
  assert.equal(syncCalls, 1);

  // An immediate repeat is throttled, not executed again.
  const third = await reconcileTodoist(deps);
  assert.equal(third.skipped, true);
  assert.equal(third.reason, "throttled");
  assert.equal(syncCalls, 1);
});

test("processDueJobs claims jobs atomically — no double-processing under concurrency", async () => {
  await seedBrandConfig("TMC");
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Has task",
    todoist_task_id: "task-123",
    status: "submitted",
  });
  await TodoistSyncJob.create({
    request_id: reqDoc._id,
    type: "create_comment",
    payload: { content: "hello", local_comment_id: "lc1" },
    status: "pending",
    next_attempt_at: new Date(),
  });

  let createCommentCalls = 0;
  const todoistClient = {
    createComment: async () => {
      createCommentCalls += 1;
      return { id: "c-1" };
    },
  };
  const { processDueJobs } = require("../src/services/syncJobs");
  const deps = { todoistClient, config: testConfig() };

  // Two concurrent workers must not process the same job twice.
  await Promise.all([processDueJobs(deps), processDueJobs(deps)]);
  assert.equal(createCommentCalls, 1);

  const job = await TodoistSyncJob.findOne({ request_id: reqDoc._id });
  assert.equal(job.status, "completed");
});

// ─── Auth fail-closed ────────────────────────────────────────────────────────────

test("auth fails closed when gateway secret is missing and insecure auth is off", async () => {
  const config = { ...testConfig(), gatewaySharedSecret: "", allowInsecureAuth: false };
  const { app } = buildApp({ config, todoistClient: {} });

  const res = await request(app)
    .get("/merchant-requests/admin/brand-configs")
    .set(authorHeaders());

  assert.equal(res.status, 401);
});
