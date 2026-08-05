const express = require("express");
const BrandTodoistConfig = require("../models/BrandTodoistConfig");
const TodoistUser = require("../models/TodoistUser");
const { assertAuthor } = require("../services/permissions");
const { reconcileTodoist } = require("../services/reconcileService");
const { linkBrandProject, provisionBrandProject } = require("../services/brandProvisioning");
const { listLocalProjects, syncAllProjects } = require("../services/todoistProjects");
const {
  addComment,
  createRequest,
  getRequestWithEvents,
  listRequests,
  normalizePriorityCaps,
  priorityCapsForConfig,
  removeRequest,
  serializeRequest,
  updateAssignee,
  updateDueDate,
  updateDeadline,
  updateStatus,
} = require("../services/requestService");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function buildRequestsRouter(deps) {
  const router = express.Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const requests = await listRequests(req.query || {}, req.principal);
      res.json({ requests });
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const request = await createRequest(req.body || {}, req.principal, deps);
      const serialized = serializeRequest(request, { includeAssignee: req.principal.isAuthor });
      res.status(201).json({ request: serialized });
    }),
  );

  // ─── Admin: brand config management ──────────────────────────────────────────

  router.get(
    "/admin/brand-configs",
    asyncHandler(async (req, res) => {
      assertAuthor(req.principal);
      const configs = await BrandTodoistConfig.find().sort({ brand_key: 1 }).lean();
      res.json({ configs });
    }),
  );

  router.get(
    "/admin/todoist-projects",
    asyncHandler(async (req, res) => {
      assertAuthor(req.principal);
      let projects = await listLocalProjects();
      // Lazy-seed on first use (empty cache) or when an explicit refresh is asked.
      if (projects.length === 0 || req.query.refresh) {
        await syncAllProjects(deps);
        projects = await listLocalProjects();
      }
      res.json({ projects });
    }),
  );

  router.post(
    "/admin/brand-configs/:brand_key/link",
    asyncHandler(async (req, res) => {
      assertAuthor(req.principal);
      const brand_key = String(req.params.brand_key || "").toUpperCase();
      const { todoist_project_id } = req.body || {};
      if (!todoist_project_id) {
        return res.status(400).json({ error: "todoist_project_id_required" });
      }
      const config = await linkBrandProject(brand_key, String(todoist_project_id), {
        todoistClient: deps.todoistClient,
      });
      res.json({ config });
    }),
  );

  router.post(
    "/admin/brand-configs/:brand_key/provision",
    asyncHandler(async (req, res) => {
      assertAuthor(req.principal);
      const brand_key = String(req.params.brand_key || "").toUpperCase();
      // Fire provisioning async (idempotent) and return immediately
      provisionBrandProject(brand_key, deps).catch((err) => {
        console.error(`[merchant-requests] manual provision error for ${brand_key}:`, err.message);
      });
      res.json({ ok: true, message: "provisioning_started" });
    }),
  );

  router.patch(
    "/admin/brand-configs/:brand_key/priority-caps",
    asyncHandler(async (req, res) => {
      assertAuthor(req.principal);
      const brand_key = String(req.params.brand_key || "").toUpperCase();
      const priority_caps = normalizePriorityCaps(req.body || {});
      const config = await BrandTodoistConfig.findOneAndUpdate(
        { brand_key },
        { $set: { priority_caps } },
        { returnDocument: "after", upsert: true },
      );
      res.json({ config, priority_caps: priorityCapsForConfig(config) });
    }),
  );

  router.delete(
    "/admin/brand-configs/:brand_key",
    asyncHandler(async (req, res) => {
      assertAuthor(req.principal);
      const brand_key = String(req.params.brand_key || "").toUpperCase();
      await BrandTodoistConfig.deleteOne({ brand_key });
      res.json({ ok: true });
    }),
  );

  // ─── Admin: existing endpoints ───────────────────────────────────────────────

  router.get(
    "/admin/todoist-users",
    asyncHandler(async (req, res) => {
      assertAuthor(req.principal);
      const users = await TodoistUser.find({ active: true }).sort({ name: 1, email: 1 }).lean();
      res.json({ users });
    }),
  );

  router.post(
    "/admin/reconcile",
    asyncHandler(async (req, res) => {
      assertAuthor(req.principal);
      const result = await reconcileTodoist(deps);
      res.json({ ok: true, result });
    }),
  );

  // ─── Per-request endpoints ───────────────────────────────────────────────────

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const result = await getRequestWithEvents(req.params.id, req.principal);
      res.json(result);
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const removed = await removeRequest(req.params.id, req.principal);
      res.json({ ok: true, request_id: String(removed._id) });
    }),
  );

  router.post(
    "/:id/comments",
    asyncHandler(async (req, res) => {
      const request = await addComment(req.params.id, req.body || {}, req.principal, deps);
      const result = await getRequestWithEvents(request._id, req.principal);
      res.status(201).json(result);
    }),
  );

  router.patch(
    "/:id/status",
    asyncHandler(async (req, res) => {
      const request = await updateStatus(req.params.id, req.body || {}, req.principal, deps);
      res.json({ request: serializeRequest(request) });
    }),
  );

  router.patch(
    "/:id/assignee",
    asyncHandler(async (req, res) => {
      const request = await updateAssignee(req.params.id, req.body || {}, req.principal, deps);
      res.json({ request: serializeRequest(request) });
    }),
  );

  router.patch(
    "/:id/due-date",
    asyncHandler(async (req, res) => {
      const request = await updateDueDate(req.params.id, req.body || {}, req.principal, deps);
      res.json({ request: serializeRequest(request) });
    }),
  );

  router.patch(
    "/:id/deadline",
    asyncHandler(async (req, res) => {
      const request = await updateDeadline(req.params.id, req.body || {}, req.principal, deps);
      res.json({ request: serializeRequest(request) });
    }),
  );

  return router;
}

module.exports = { buildRequestsRouter };
