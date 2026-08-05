require("express-async-errors");
const express = require("express");
const tenantRoutes = require("./routes/tenant.routes");
const pipelineRoutes = require("./routes/pipeline.routes");
const { collectRoutes, createHealthMonitorReporter } = require("./healthMonitor");
const { TenantError } = require("./utils/errors");
const {
  initObservability,
  sentryErrorMiddleware,
} = require("./observability");

const app = express();

app.use(express.json());
initObservability(app);
app.use(createHealthMonitorReporter({
  serviceName: "tenant-router",
  baseUrl: "http://tenant-router:3004",
}));

// Routes
app.use("/tenant", tenantRoutes);
app.use("/tenant/pipeline", pipelineRoutes);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", service: "tenant-router" });
});

app.get("/health/monitor", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "tenant-router",
    message: "probe_ok",
  });
});

// Centralized Error Handler
app.use(sentryErrorMiddleware);
app.use((err, req, res, _next) => {
  if (err instanceof TenantError) {
    return res.status(err.statusCode).json({ error: err.code });
  }

  console.error("[AppError]", err);
  res.status(500).json({ error: "internal_server_error" });
});

module.exports = app;
module.exports.buildHealthMonitorRegistrationPayload = function buildHealthMonitorRegistrationPayload() {
  return {
    serviceName: "tenant-router",
    baseUrl: "http://tenant-router:3004",
    healthEndpoint: "/health",
    dependencies: ["mongo"],
    endpoints: [
      { path: "/health", method: "GET", critical: true, intervalSeconds: 30, successStatusFamily: "2xx" },
      { path: "/health/monitor", method: "GET", critical: true, intervalSeconds: 60, successStatusFamily: "2xx" },
    ],
    discoveredRoutes: [
      ...collectRoutes(app, { sourceModule: "src/app.js" }),
      ...collectRoutes(tenantRoutes, { mountPath: "/tenant", sourceModule: "src/routes/tenant.routes.js" }),
      ...collectRoutes(pipelineRoutes, { mountPath: "/tenant/pipeline", sourceModule: "src/routes/pipeline.routes.js" }),
    ],
  };
};
