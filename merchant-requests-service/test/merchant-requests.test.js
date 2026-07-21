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
const { buildTaskPayload, getMerchantRaisedSectionId } = require("../src/services/syncJobs");
const { ensureFallbackBrandConfig, provisionBrandProject } = require("../src/services/brandProvisioning");
const { backfillMerchantRequestWorkflow } = require("../src/services/migrations");

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

function brandConfig(overrides = {}) {
  return {
    todoist_project_id: "project-1",
    merchant_raised_section_id: "sec-raised",
    section_by_status: {
      submitted: "sec-raised",
      assigned: "sec-raised",
      done: "sec-raised",
    },
    priority_caps: {
      urgent: 1,
      high: 2,
      normal: 3,
      low: 5,
    },
    ...overrides,
  };
}

async function seedBrandConfig(brand_key = "TMC", overrides = {}) {
  return BrandTodoistConfig.create({
    brand_key,
    provisioning_status: "ready",
    provisioning_mode: "auto",
    provisioning_error: "",
    ...brandConfig(overrides),
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

function appWithTodoist(todoistClient = {}) {
  return buildApp({ config: testConfig(), todoistClient }).app;
}

function signedTodoistPost(app, payload, deliveryId = "delivery-1") {
  const raw = JSON.stringify(payload);
  return request(app)
    .post("/merchant-requests/todoist/webhook")
    .set("Content-Type", "application/json")
    .set("X-Todoist-Hmac-SHA256", computeTodoistHmac(raw, "secret"))
    .set("X-Todoist-Delivery-ID", deliveryId)
    .send(raw);
}

test.beforeEach(async (t) => {
  const mongo = await MongoMemoryServer.create();
  t.after(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
  await mongoose.connect(mongo.getUri(), { dbName: "merchant_requests_test" });
});

test("buildTaskPayload uses Merchant Raised section and includes due date and deadline", async () => {
  const req = new MerchantRequest({
    brand_key: "TMC",
    requester: { user_id: "u1", email: "merchant@example.com" },
    title: "Help with report",
    description: "Need a custom report",
    category: "Data Analysis",
    status: "submitted",
    due_date: "2026-06-25",
    deadline_date: "2026-06-30",
  });

  const payload = buildTaskPayload(req, brandConfig());

  assert.equal(payload.content, "Help with report");
  assert.equal(payload.project_id, "project-1");
  assert.equal(payload.section_id, "sec-raised");
  assert.equal(payload.due_date, "2026-06-25");
  assert.equal(payload.deadline_date, "2026-06-30");
  assert.ok(payload.labels.includes("category:Data Analysis"));
  assert.match(payload.description, /Datum Request ID:/);
});

test("getMerchantRaisedSectionId falls back to old submitted section", () => {
  assert.equal(
    getMerchantRaisedSectionId({ section_by_status: { submitted: "legacy-submitted" } }),
    "legacy-submitted",
  );
});

test("provisioning creates only the Merchant Raised section", async () => {
  const createdSections = [];
  const todoistClient = {
    createProject: async () => ({ id: "project-1" }),
    listSections: async () => [],
    createSection: async (name) => {
      createdSections.push(name);
      return { id: "sec-raised" };
    },
  };

  await provisionBrandProject("TMC", { todoistClient, config: testConfig() });

  assert.deepEqual(createdSections, ["Merchant Raised"]);
  const cfg = await BrandTodoistConfig.findOne({ brand_key: "TMC" }).lean();
  assert.equal(cfg.merchant_raised_section_id, "sec-raised");
  assert.equal(cfg.section_by_status.submitted, "sec-raised");
});

test("fallback provisioning creates the unassigned project and Merchant Raised section", async () => {
  const createdProjects = [];
  const createdSections = [];
  const todoistClient = {
    listProjects: async () => [],
    createProject: async (name) => {
      createdProjects.push(name);
      return { id: "fallback-project", name };
    },
    listSections: async () => [],
    createSection: async (name) => {
      createdSections.push(name);
      return { id: "fallback-section", name };
    },
  };

  const cfg = await ensureFallbackBrandConfig({ todoistClient, config: testConfig() });

  assert.deepEqual(createdProjects, ["Datum - Unassigned Merchant Requests"]);
  assert.deepEqual(createdSections, ["Merchant Raised"]);
  assert.equal(cfg.brand_key, "UNASSIGNED");
  assert.equal(cfg.todoist_project_id, "fallback-project");
  assert.equal(cfg.merchant_raised_section_id, "fallback-section");
});

test("fallback provisioning reuses existing fallback project and section", async () => {
  const todoistClient = {
    listProjects: async () => [{ id: "fallback-project", name: "Datum - Unassigned Merchant Requests" }],
    createProject: async () => {
      throw new Error("should_not_create_project");
    },
    listSections: async () => [{ id: "fallback-section", name: "Merchant Raised" }],
    createSection: async () => {
      throw new Error("should_not_create_section");
    },
  };

  const cfg = await ensureFallbackBrandConfig({ todoistClient, config: testConfig() });

  assert.equal(cfg.todoist_project_id, "fallback-project");
  assert.equal(cfg.merchant_raised_section_id, "fallback-section");
});

test("creation rejects invalid category and invalid priority", async () => {
  await seedBrandConfig("TMC");
  const app = appWithTodoist({ createTask: async () => ({ id: "task-1" }) });

  const invalidCategory = await request(app)
    .post("/merchant-requests")
    .set(merchantHeaders("TMC"))
    .send({ brand_key: "TMC", title: "Bad category", category: "Technical" });
  assert.equal(invalidCategory.status, 400);
  assert.equal(invalidCategory.body.error, "invalid_category");

  const invalidPriority = await request(app)
    .post("/merchant-requests")
    .set(merchantHeaders("TMC"))
    .send({ brand_key: "TMC", title: "Bad priority", priority: "critical" });
  assert.equal(invalidPriority.status, 400);
  assert.equal(invalidPriority.body.error, "invalid_priority");
});

test("creation enforces default priority caps per brand and excludes done requests", async () => {
  await seedBrandConfig("TMC");
  const app = appWithTodoist({ createTask: async () => ({ id: `task-${Date.now()}` }) });

  for (let i = 0; i < 3; i += 1) {
    const res = await request(app)
      .post("/merchant-requests")
      .set(merchantHeaders("TMC"))
      .send({ brand_key: "TMC", title: `Normal ${i}`, category: "Feature Request", priority: "normal" });
    assert.equal(res.status, 201);
  }

  const capped = await request(app)
    .post("/merchant-requests")
    .set(merchantHeaders("TMC"))
    .send({ brand_key: "TMC", title: "One too many", category: "Feature Request", priority: "normal" });

  assert.equal(capped.status, 409);
  assert.equal(capped.body.error, "priority_cap_reached");
  assert.equal(capped.body.priority, "normal");
  assert.equal(capped.body.limit, 3);
  assert.equal(capped.body.active_count, 3);

  await MerchantRequest.updateOne(
    { title: "Normal 0" },
    { $set: { removed_at: new Date(), removal_reason: "todoist_tag_removed" } },
  );
  const afterRemoval = await request(app)
    .post("/merchant-requests")
    .set(merchantHeaders("TMC"))
    .send({ brand_key: "TMC", title: "Allowed after removal", category: "Feature Request", priority: "normal" });
  assert.equal(afterRemoval.status, 201);

  await MerchantRequest.updateOne({ title: "Normal 1" }, { $set: { status: "done" } });
  const afterDone = await request(app)
    .post("/merchant-requests")
    .set(merchantHeaders("TMC"))
    .send({ brand_key: "TMC", title: "Allowed again", category: "Feature Request", priority: "normal" });
  assert.equal(afterDone.status, 201);
});

test("author can update priority caps and new caps affect creation", async () => {
  await seedBrandConfig("TMC");
  const app = appWithTodoist({ createTask: async () => ({ id: `task-${Date.now()}` }) });

  const update = await request(app)
    .patch("/merchant-requests/admin/brand-configs/TMC/priority-caps")
    .set(authorHeaders())
    .send({ urgent: 1, high: 1, normal: 1, low: 1 });
  assert.equal(update.status, 200);
  assert.equal(update.body.priority_caps.normal, 1);

  const first = await request(app)
    .post("/merchant-requests")
    .set(merchantHeaders("TMC"))
    .send({ brand_key: "TMC", title: "First", category: "Design", priority: "normal" });
  assert.equal(first.status, 201);

  const second = await request(app)
    .post("/merchant-requests")
    .set(merchantHeaders("TMC"))
    .send({ brand_key: "TMC", title: "Second", category: "Design", priority: "normal" });
  assert.equal(second.status, 409);
});

test("merchant responses hide assignee while author responses include it", async () => {
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Assigned internally",
    category: "Issues",
    status: "assigned",
    assignee: { todoist_user_id: "u1", name: "Internal User", email: "internal@example.com" },
  });
  const app = appWithTodoist({});

  const merchant = await request(app).get(`/merchant-requests/${reqDoc._id}`).set(merchantHeaders("TMC"));
  assert.equal(merchant.status, 200);
  assert.equal(merchant.body.request.assignee, undefined);

  const author = await request(app).get(`/merchant-requests/${reqDoc._id}`).set(authorHeaders("TMC"));
  assert.equal(author.status, 200);
  assert.equal(author.body.request.assignee.name, "Internal User");
});

test("merchant timeline does not reveal assignee identity", async () => {
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Timeline privacy",
    category: "Issues",
  });
  await MerchantRequestEvent.create({
    request_id: reqDoc._id,
    brand_key: "TMC",
    type: "assignment_changed",
    source: "todoist",
    actor: { name: "Todoist" },
    data: { todoist_user_id: "secret-user" },
  });
  const app = appWithTodoist({});

  const res = await request(app).get(`/merchant-requests/${reqDoc._id}`).set(merchantHeaders("TMC"));

  assert.equal(res.status, 200);
  assert.equal(res.body.events[0].message, "Request assigned");
  assert.deepEqual(res.body.events[0].data, {});
});

test("Todoist assignment webhook stores assignee internally and sets status assigned", async () => {
  await seedBrandConfig("TMC");
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Webhook assignment",
    category: "Issues",
    status: "submitted",
    todoist_task_id: "task-1",
    sync: { todoist_task_status: "synced" },
  });
  const app = appWithTodoist({});

  const res = await signedTodoistPost(
    app,
    {
      event_name: "item:updated",
      event_data: {
        id: "task-1",
        assignee_id: "todoist-user-1",
        labels: ["Datum", "merchant-request", "brand:TMC"],
      },
    },
    "delivery-assigned",
  );

  assert.equal(res.status, 200);
  const updated = await MerchantRequest.findById(reqDoc._id).lean();
  assert.equal(updated.status, "assigned");
  assert.equal(updated.assignee.todoist_user_id, "todoist-user-1");
});

test("Todoist completion webhook sets status done and dedupes delivery id", async () => {
  await seedBrandConfig("TMC");
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Webhook done",
    category: "Issues",
    status: "assigned",
    todoist_task_id: "task-1",
    sync: { todoist_task_status: "synced" },
  });
  const app = appWithTodoist({});
  const payload = {
    event_name: "item:completed",
    event_data: {
      id: "task-1",
      labels: ["Datum", "merchant-request", "brand:TMC"],
    },
  };

  const first = await signedTodoistPost(app, payload, "delivery-completed");
  assert.equal(first.status, 200);
  assert.equal(first.body.processed, true);

  const updated = await MerchantRequest.findById(reqDoc._id).lean();
  assert.equal(updated.status, "done");
  assert.ok(updated.closed_at);

  const second = await signedTodoistPost(app, payload, "delivery-completed");
  assert.equal(second.status, 200);
  assert.equal(second.body.duplicate, true);

  const deliveries = await TodoistWebhookDelivery.find({ delivery_id: "delivery-completed" }).lean();
  assert.equal(deliveries.length, 1);
});

test("webhook imports unlinked tagged task using brand label", async () => {
  await seedBrandConfig("TMC");
  const app = appWithTodoist({});

  const res = await signedTodoistPost(
    app,
    {
      event_name: "item:updated",
      event_data: {
        id: "todoist-new-1",
        content: "Imported request",
        description: "From Todoist",
        project_id: "other-project",
        section_id: "any-section",
        labels: ["merchant-request", "brand:TMC", "category:Design"],
        priority: 4,
        due: { date: "2026-06-30" },
        deadline: { date: "2026-07-04" },
      },
    },
    "delivery-import-brand",
  );

  assert.equal(res.status, 200);
  const imported = await MerchantRequest.findOne({ todoist_task_id: "todoist-new-1" }).lean();
  assert.equal(imported.brand_key, "TMC");
  assert.equal(imported.title, "Imported request");
  assert.equal(imported.category, "Design");
  assert.equal(imported.priority, "urgent");
  assert.equal(imported.due_date, "2026-06-30");
  assert.equal(imported.deadline_date, "2026-07-04");
  const event = await MerchantRequestEvent.findOne({ request_id: imported._id, type: "request_imported" }).lean();
  assert.ok(event);
});

test("webhook imports tagged task via mapped Todoist project config", async () => {
  await seedBrandConfig("TMC", { todoist_project_id: "mapped-project" });
  const app = appWithTodoist({});

  const res = await signedTodoistPost(
    app,
    {
      event_name: "item:updated",
      event_data: {
        id: "todoist-new-2",
        content: "Mapped project request",
        project_id: "mapped-project",
        labels: ["merchant-request"],
      },
    },
    "delivery-import-project",
  );

  assert.equal(res.status, 200);
  const imported = await MerchantRequest.findOne({ todoist_task_id: "todoist-new-2" }).lean();
  assert.equal(imported.brand_key, "TMC");
});

test("project mapping wins over conflicting brand label during import", async () => {
  await seedBrandConfig("TMC", { todoist_project_id: "mapped-project" });
  const app = appWithTodoist({});

  const res = await signedTodoistPost(
    app,
    {
      event_name: "item:updated",
      event_data: {
        id: "todoist-new-conflict",
        content: "Mapped project wins",
        project_id: "mapped-project",
        labels: ["merchant-request", "brand:OTHER"],
      },
    },
    "delivery-import-project-wins",
  );

  assert.equal(res.status, 200);
  const imported = await MerchantRequest.findOne({ todoist_task_id: "todoist-new-conflict" }).lean();
  assert.equal(imported.brand_key, "TMC");
});

test("webhook imports unknown-brand tagged task into fallback project and normalizes Todoist task", async () => {
  const updateCalls = [];
  const app = appWithTodoist({
    listProjects: async () => [],
    createProject: async () => ({ id: "fallback-project", name: "Datum - Unassigned Merchant Requests" }),
    listSections: async () => [],
    createSection: async () => ({ id: "fallback-section", name: "Merchant Raised" }),
    updateTask: async (taskId, payload) => {
      updateCalls.push({ taskId, payload });
      return { id: taskId };
    },
  });

  const res = await signedTodoistPost(
    app,
    {
      event_name: "item:updated",
      event_data: {
        id: "todoist-new-3",
        content: "Needs triage",
        project_id: "unknown-project",
        section_id: "random-section",
        labels: ["merchant-request", "category:Issues"],
      },
    },
    "delivery-import-fallback",
  );

  assert.equal(res.status, 200);
  const imported = await MerchantRequest.findOne({ todoist_task_id: "todoist-new-3" }).lean();
  assert.equal(imported.brand_key, "UNASSIGNED");
  assert.equal(imported.todoist_section_id, "fallback-section");
  assert.ok(imported.todoist_labels.includes("brand:UNASSIGNED"));
  assert.deepEqual(updateCalls, [
    {
      taskId: "todoist-new-3",
      payload: {
        project_id: "fallback-project",
        section_id: "fallback-section",
        labels: ["merchant-request", "category:Issues", "Datum", "brand:UNASSIGNED"],
      },
    },
  ]);
});

test("webhook ignores untagged Todoist task even if it is in Merchant Raised", async () => {
  const app = appWithTodoist({});

  const res = await signedTodoistPost(
    app,
    {
      event_name: "item:updated",
      event_data: {
        id: "todoist-untagged",
        content: "No import",
        section_id: "sec-raised",
        labels: [],
      },
    },
    "delivery-untagged",
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.ignored, true);
  assert.equal(await MerchantRequest.countDocuments({ todoist_task_id: "todoist-untagged" }), 0);
});

test("removing and restoring merchant-request soft-removes and restores an imported request", async () => {
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "todoist", name: "Todoist" },
    title: "Imported lifecycle",
    category: "Issues",
    status: "submitted",
    todoist_task_id: "todoist-soft-remove",
    todoist_labels: ["Datum", "merchant-request", "brand:TMC"],
    sync: { todoist_task_status: "synced" },
  });
  const job = await TodoistSyncJob.create({
    request_id: reqDoc._id,
    type: "create_comment",
    payload: { content: "pending" },
    status: "pending",
  });
  const app = appWithTodoist({});

  const removed = await signedTodoistPost(
    app,
    {
      event_name: "item:updated",
      event_data: {
        id: "todoist-soft-remove",
        labels: ["Datum", "brand:TMC"],
      },
    },
    "delivery-soft-remove",
  );
  assert.equal(removed.status, 200);

  let stored = await MerchantRequest.findById(reqDoc._id).lean();
  assert.ok(stored.removed_at);
  assert.equal(stored.removal_reason, "todoist_tag_removed");
  assert.deepEqual(stored.todoist_labels, ["Datum", "brand:TMC"]);
  assert.equal((await TodoistSyncJob.findById(job._id).lean()).status, "cancelled");

  const listWhileRemoved = await request(app).get("/merchant-requests").set(authorHeaders("TMC"));
  assert.equal(listWhileRemoved.status, 200);
  assert.equal(listWhileRemoved.body.requests.length, 0);
  assert.equal((await request(app).get(`/merchant-requests/${reqDoc._id}`).set(authorHeaders("TMC"))).status, 404);
  assert.equal(
    (
      await request(app)
        .patch(`/merchant-requests/${reqDoc._id}/status`)
        .set(authorHeaders("TMC"))
        .send({ status: "done" })
    ).status,
    404,
  );

  await signedTodoistPost(
    app,
    {
      event_name: "item:updated",
      event_data: { id: "todoist-soft-remove", labels: ["Datum", "brand:TMC"] },
    },
    "delivery-soft-remove-repeat",
  );
  assert.equal(
    await MerchantRequestEvent.countDocuments({ request_id: reqDoc._id, type: "request_removed" }),
    1,
  );

  const restored = await signedTodoistPost(
    app,
    {
      event_name: "item:updated",
      event_data: {
        id: "todoist-soft-remove",
        labels: ["Datum", "merchant-request", "brand:TMC"],
      },
    },
    "delivery-soft-restore",
  );
  assert.equal(restored.status, 200);

  stored = await MerchantRequest.findById(reqDoc._id).lean();
  assert.equal(stored.removed_at, null);
  assert.equal(stored.removal_reason, "");
  assert.equal(await MerchantRequest.countDocuments({ todoist_task_id: "todoist-soft-remove" }), 1);
  assert.equal(
    await MerchantRequestEvent.countDocuments({ request_id: reqDoc._id, type: "request_restored" }),
    1,
  );
  const listAfterRestore = await request(app).get("/merchant-requests").set(authorHeaders("TMC"));
  assert.equal(listAfterRestore.body.requests.length, 1);
  assert.equal(listAfterRestore.body.requests[0].id, String(reqDoc._id));
});

test("partial Todoist events and Datum-created requests are not soft-removed", async () => {
  const imported = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "todoist", name: "Todoist" },
    title: "Partial event",
    category: "Issues",
    todoist_task_id: "todoist-partial-event",
    todoist_labels: ["merchant-request", "brand:TMC"],
  });
  const datum = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Datum request",
    category: "Issues",
    todoist_task_id: "datum-task-label-removed",
    todoist_labels: ["merchant-request", "brand:TMC"],
  });
  const app = appWithTodoist({});

  await signedTodoistPost(
    app,
    { event_name: "item:updated", event_data: { id: "todoist-partial-event", priority: 2 } },
    "delivery-partial-no-labels",
  );
  await signedTodoistPost(
    app,
    {
      event_name: "item:updated",
      event_data: { id: "datum-task-label-removed", labels: ["Datum", "brand:TMC"] },
    },
    "delivery-datum-label-removed",
  );

  assert.equal((await MerchantRequest.findById(imported._id).lean()).removed_at, null);
  assert.equal((await MerchantRequest.findById(datum._id).lean()).removed_at, null);
});

test("imported assigned and completed tasks map to assigned and done", async () => {
  await seedBrandConfig("TMC");
  const app = appWithTodoist({});

  await signedTodoistPost(
    app,
    {
      event_name: "item:updated",
      event_data: {
        id: "todoist-assigned-import",
        content: "Assigned import",
        labels: ["merchant-request", "brand:TMC"],
        assignee_id: "todoist-user-1",
      },
    },
    "delivery-import-assigned",
  );
  const assigned = await MerchantRequest.findOne({ todoist_task_id: "todoist-assigned-import" }).lean();
  assert.equal(assigned.status, "assigned");
  assert.equal(assigned.assignee.todoist_user_id, "todoist-user-1");

  await signedTodoistPost(
    app,
    {
      event_name: "item:completed",
      event_data: {
        id: "todoist-done-import",
        content: "Done import",
        labels: ["merchant-request", "brand:TMC"],
      },
    },
    "delivery-import-done",
  );
  const done = await MerchantRequest.findOne({ todoist_task_id: "todoist-done-import" }).lean();
  assert.equal(done.status, "done");
  assert.ok(done.closed_at);
});

test("reconcile imports unlinked tagged Todoist task", async () => {
  await seedBrandConfig("TMC");
  const existingImported = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "todoist", name: "Todoist" },
    title: "Reconcile removal",
    category: "Issues",
    todoist_task_id: "todoist-reconcile-remove",
    todoist_labels: ["merchant-request", "brand:TMC"],
  });
  const todoistClient = {
    listProjects: async () => [],
    sync: async () => ({
      items: [
        {
          id: "todoist-reconcile-import",
          content: "Reconcile import",
          labels: ["merchant-request", "brand:TMC"],
        },
        {
          id: "todoist-reconcile-remove",
          content: "Reconcile removal",
          labels: ["brand:TMC"],
        },
      ],
      collaborators: [],
      notes: [],
      sync_token: "next-token",
    }),
  };
  const { reconcileTodoist } = require("../src/services/reconcileService");

  const result = await reconcileTodoist({ todoistClient, config: testConfig() });

  assert.equal(result.tasks_processed, 2);
  const imported = await MerchantRequest.findOne({ todoist_task_id: "todoist-reconcile-import" }).lean();
  assert.equal(imported.brand_key, "TMC");
  assert.equal(imported.title, "Reconcile import");
  assert.ok((await MerchantRequest.findById(existingImported._id).lean()).removed_at);
});

test("existing linked Todoist task updates without duplicate import", async () => {
  await seedBrandConfig("TMC");
  await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Existing",
    category: "Issues",
    todoist_task_id: "existing-task",
    status: "submitted",
  });
  const app = appWithTodoist({});

  const res = await signedTodoistPost(
    app,
    {
      event_name: "item:updated",
      event_data: {
        id: "existing-task",
        content: "Existing",
        labels: ["merchant-request", "brand:TMC"],
        assignee_id: "todoist-user-1",
      },
    },
    "delivery-existing-linked",
  );

  assert.equal(res.status, 200);
  assert.equal(await MerchantRequest.countDocuments({ todoist_task_id: "existing-task" }), 1);
  const updated = await MerchantRequest.findOne({ todoist_task_id: "existing-task" }).lean();
  assert.equal(updated.status, "assigned");
});

test("author assignee update sends Todoist assignee and sets local status assigned", async () => {
  await seedBrandConfig("TMC");
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Assign me",
    category: "Development",
    status: "submitted",
    todoist_task_id: "task-1",
    sync: { todoist_task_status: "synced" },
  });
  const calls = [];
  const app = appWithTodoist({
    updateTask: async (taskId, payload) => {
      calls.push({ taskId, payload });
      return { id: taskId };
    },
  });

  const res = await request(app)
    .patch(`/merchant-requests/${reqDoc._id}/assignee`)
    .set(authorHeaders("TMC"))
    .send({ todoist_user_id: "todoist-user-1" });

  assert.equal(res.status, 200);
  assert.equal(res.body.request.status, "assigned");
  assert.deepEqual(calls[0], { taskId: "task-1", payload: { assignee_id: "todoist-user-1" } });
});

test("author status done completes the Todoist task", async () => {
  await seedBrandConfig("TMC");
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Complete me",
    category: "Development",
    status: "assigned",
    todoist_task_id: "task-1",
    sync: { todoist_task_status: "synced" },
  });
  const completed = [];
  const app = appWithTodoist({
    completeTask: async (taskId) => {
      completed.push(taskId);
      return {};
    },
  });

  const res = await request(app)
    .patch(`/merchant-requests/${reqDoc._id}/status`)
    .set(authorHeaders("TMC"))
    .send({ status: "done" });

  assert.equal(res.status, 200);
  assert.equal(res.body.request.status, "done");
  assert.deepEqual(completed, ["task-1"]);
});

test("author can set and clear due date", async () => {
  await seedBrandConfig("TMC");
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Due me",
    category: "Development",
    todoist_task_id: "task-1",
    sync: { todoist_task_status: "synced" },
  });
  const calls = [];
  const app = appWithTodoist({
    updateTask: async (taskId, payload) => {
      calls.push({ taskId, payload });
      return { id: taskId };
    },
  });

  const set = await request(app)
    .patch(`/merchant-requests/${reqDoc._id}/due-date`)
    .set(authorHeaders("TMC"))
    .send({ due_date: "2026-06-25" });
  assert.equal(set.status, 200);
  assert.equal(set.body.request.due_date, "2026-06-25");

  const clear = await request(app)
    .patch(`/merchant-requests/${reqDoc._id}/due-date`)
    .set(authorHeaders("TMC"))
    .send({ due_date: "" });
  assert.equal(clear.status, 200);
  assert.equal(clear.body.request.due_date, "");
  assert.deepEqual(calls.map((c) => c.payload), [{ due_date: "2026-06-25" }, { due_date: null }]);
});

test("author can set and clear deadline without changing due date", async () => {
  await seedBrandConfig("TMC");
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Deadline me",
    category: "Development",
    due_date: "2026-06-20",
    todoist_task_id: "task-deadline",
    sync: { todoist_task_status: "synced" },
  });
  const calls = [];
  const app = appWithTodoist({
    updateTask: async (taskId, payload) => {
      calls.push({ taskId, payload });
      return { id: taskId };
    },
  });

  const set = await request(app)
    .patch(`/merchant-requests/${reqDoc._id}/deadline`)
    .set(authorHeaders("TMC"))
    .send({ deadline_date: "2026-06-25" });
  assert.equal(set.status, 200);
  assert.equal(set.body.request.deadline_date, "2026-06-25");
  assert.equal(set.body.request.due_date, "2026-06-20");

  const clear = await request(app)
    .patch(`/merchant-requests/${reqDoc._id}/deadline`)
    .set(authorHeaders("TMC"))
    .send({ deadline_date: "" });
  assert.equal(clear.status, 200);
  assert.equal(clear.body.request.deadline_date, "");
  assert.deepEqual(calls.map((call) => call.payload), [
    { deadline_date: "2026-06-25" },
    { deadline_date: null },
  ]);
});

test("manual soft removal is author-only and is not restored by Todoist", async () => {
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "todoist", name: "Todoist" },
    title: "Remove manually",
    category: "Issues",
    todoist_task_id: "manual-remove-task",
    todoist_labels: ["merchant-request", "brand:TMC"],
  });
  const job = await TodoistSyncJob.create({
    request_id: reqDoc._id,
    type: "create_comment",
    status: "pending",
  });
  const app = appWithTodoist({});

  const forbidden = await request(app)
    .delete(`/merchant-requests/${reqDoc._id}`)
    .set(merchantHeaders("TMC"));
  assert.equal(forbidden.status, 403);

  const removed = await request(app)
    .delete(`/merchant-requests/${reqDoc._id}`)
    .set(authorHeaders("TMC"));
  assert.equal(removed.status, 200);
  let stored = await MerchantRequest.findById(reqDoc._id).lean();
  assert.ok(stored.removed_at);
  assert.equal(stored.removal_reason, "author_removed");
  assert.equal((await TodoistSyncJob.findById(job._id).lean()).status, "cancelled");

  await signedTodoistPost(
    app,
    {
      event_name: "item:updated",
      event_data: {
        id: "manual-remove-task",
        labels: ["merchant-request", "brand:TMC"],
      },
    },
    "delivery-manual-remove-no-restore",
  );
  stored = await MerchantRequest.findById(reqDoc._id).lean();
  assert.ok(stored.removed_at);
  assert.equal(stored.removal_reason, "author_removed");
  assert.equal(
    await MerchantRequestEvent.countDocuments({ request_id: reqDoc._id, type: "request_restored" }),
    0,
  );
});

test("merchant create request with due_date is rejected", async () => {
  const app = appWithTodoist({});

  const res = await request(app)
    .post("/merchant-requests")
    .set(merchantHeaders("TMC"))
    .send({ brand_key: "TMC", title: "Need help", due_date: "2026-06-25" });

  assert.equal(res.status, 403);
  assert.equal(res.body.error, "author_required");
});

test("merchant create request with deadline_date is rejected", async () => {
  const app = appWithTodoist({});
  const res = await request(app)
    .post("/merchant-requests")
    .set(merchantHeaders("TMC"))
    .send({ brand_key: "TMC", title: "Need help", deadline_date: "2026-06-25" });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, "author_required");
});

test("comments are author-only", async () => {
  await seedBrandConfig("TMC");
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Author comments only",
    category: "Issues",
    todoist_task_id: "comment-task",
    sync: { todoist_task_status: "synced" },
  });
  const calls = [];
  const app = appWithTodoist({
    createComment: async (taskId, content) => {
      calls.push({ taskId, content });
      return { id: "todoist-comment-1" };
    },
  });

  const merchant = await request(app)
    .post(`/merchant-requests/${reqDoc._id}/comments`)
    .set(merchantHeaders("TMC"))
    .send({ content: "Merchant comment" });
  assert.equal(merchant.status, 403);
  assert.equal(merchant.body.error, "author_required");

  const author = await request(app)
    .post(`/merchant-requests/${reqDoc._id}/comments`)
    .set(authorHeaders("TMC"))
    .send({ content: "Author comment" });
  assert.equal(author.status, 201);
  assert.deepEqual(calls, [{ taskId: "comment-task", content: "Author comment" }]);
});

test("viewer without requests_panel cannot access request endpoints", async () => {
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Restricted",
    category: "Issues",
  });
  const app = appWithTodoist({});
  const noRequestAccess = merchantHeaders("TMC", []);

  const list = await request(app).get("/merchant-requests").set(noRequestAccess);
  assert.equal(list.status, 403);

  const detail = await request(app).get(`/merchant-requests/${reqDoc._id}`).set(noRequestAccess);
  assert.equal(detail.status, 403);

  const comment = await request(app)
    .post(`/merchant-requests/${reqDoc._id}/comments`)
    .set(noRequestAccess)
    .send({ content: "Blocked" });
  assert.equal(comment.status, 403);
});

test("viewer with requests_panel but without requests_timeline gets hidden timeline marker", async () => {
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Timeline hidden",
    category: "Issues",
  });
  await MerchantRequestEvent.create({
    request_id: reqDoc._id,
    brand_key: "TMC",
    type: "request_created",
    source: "datum",
    actor: { user_id: "merchant-1" },
  });
  const app = appWithTodoist({});

  const res = await request(app)
    .get(`/merchant-requests/${reqDoc._id}`)
    .set(merchantHeaders("TMC", ["requests_panel"]));

  assert.equal(res.status, 200);
  assert.equal(res.body.timeline_hidden, true);
  assert.deepEqual(res.body.events, []);
});

test("startup backfill maps old statuses and categories", async () => {
  await MerchantRequest.collection.insertOne({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Legacy",
    category: "Technical",
    status: "in_progress",
    created_at: new Date(),
    updated_at: new Date(),
  });

  await backfillMerchantRequestWorkflow();

  const updated = await MerchantRequest.findOne({ title: "Legacy" }).lean();
  assert.equal(updated.status, "assigned");
  assert.equal(updated.category, "Feature Request");
});

test("processDueJobs claims jobs atomically", async () => {
  await seedBrandConfig("TMC");
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "merchant-1" },
    title: "Has task",
    category: "Issues",
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

  await Promise.all([
    processDueJobs({ todoistClient, config: testConfig() }),
    processDueJobs({ todoistClient, config: testConfig() }),
  ]);

  assert.equal(createCommentCalls, 1);
  const job = await TodoistSyncJob.findOne({ request_id: reqDoc._id });
  assert.equal(job.status, "completed");
});

test("processDueJobs cancels work for a soft-removed request", async () => {
  const reqDoc = await MerchantRequest.create({
    brand_key: "TMC",
    requester: { user_id: "todoist", name: "Todoist" },
    title: "Removed job",
    category: "Issues",
    todoist_task_id: "removed-job-task",
    removed_at: new Date(),
    removal_reason: "todoist_tag_removed",
  });
  await TodoistSyncJob.create({
    request_id: reqDoc._id,
    type: "create_comment",
    payload: { content: "must not sync" },
    status: "pending",
    next_attempt_at: new Date(),
  });

  let createCommentCalls = 0;
  const { processDueJobs } = require("../src/services/syncJobs");
  await processDueJobs({
    todoistClient: {
      createComment: async () => {
        createCommentCalls += 1;
        return { id: "should-not-exist" };
      },
    },
    config: testConfig(),
  });

  assert.equal(createCommentCalls, 0);
  assert.equal((await TodoistSyncJob.findOne({ request_id: reqDoc._id }).lean()).status, "cancelled");
});
