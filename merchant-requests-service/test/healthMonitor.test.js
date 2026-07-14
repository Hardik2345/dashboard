const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const { collectRoutes } = require("../src/healthMonitor");

test("collectRoutes preserves mount prefixes and parameterized paths", () => {
  const router = express.Router();
  router.get("/:id", function showRequest(_req, res) {
    res.json({ ok: true });
  });
  router.post("/", function createRequest(_req, res) {
    res.status(201).json({ ok: true });
  });

  const routes = collectRoutes(router, {
    mountPath: "/merchant-requests",
    sourceModule: "src/routes/requests.js",
    mountMiddlewareNames: ["buildAuthMiddleware"],
  });

  assert.deepEqual(
    routes.map((route) => ({ method: route.method, path: route.path })),
    [
      { method: "GET", path: "/merchant-requests/:id" },
      { method: "POST", path: "/merchant-requests" },
    ],
  );
  assert.equal(routes[0].hasPathParams, true);
  assert.equal(routes[0].authRequired, true);
  assert.equal(routes[0].monitoringRecommendation, "probe_only");
  assert.equal(routes[0].sourceModule, "src/routes/requests.js");
});

test("collectRoutes classifies health endpoints as direct health candidates", () => {
  const app = express();
  app.get("/health", function health(_req, res) {
    res.json({ ok: true });
  });
  app.get("/health/monitor", function monitor(_req, res) {
    res.json({ ok: true });
  });

  const routes = collectRoutes(app, { sourceModule: "src/app.js" });
  const health = routes.find((route) => route.path === "/health");
  const monitor = routes.find((route) => route.path === "/health/monitor");

  assert.equal(health.routeType, "health");
  assert.equal(health.monitoringRecommendation, "direct_health_candidate");
  assert.equal(health.successHint, "2xx");
  assert.equal(monitor.routeType, "probe");
  assert.equal(monitor.monitoringRecommendation, "direct_health_candidate");
});
