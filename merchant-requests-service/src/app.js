require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { getConfig } = require("./config");
const { buildAuthMiddleware } = require("./middleware/auth");
const { buildRequestsRouter } = require("./routes/requests");
const { buildWebhookRouter } = require("./routes/webhook");
const { TodoistClient } = require("./services/todoistClient");
const { collectRoutes, createHealthMonitorReporter } = require("./healthMonitor");

function buildApp(overrides = {}) {
  const config = overrides.config || getConfig();
  const todoistClient =
    overrides.todoistClient ||
    new TodoistClient({
      apiToken: config.todoist.apiToken,
      apiBaseUrl: config.todoist.apiBaseUrl,
    });

  const app = express();
  const webhookRouter = buildWebhookRouter(config, { todoistClient });
  const requestsRouter = buildRequestsRouter({ config, todoistClient });
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins.length ? config.corsOrigins : true,
      credentials: true,
    }),
  );
  app.use(createHealthMonitorReporter({
    serviceName: "merchant-requests-service",
    baseUrl: "http://merchant-requests-service:4020",
  }));

  app.get("/health", (_req, res) => res.json({ ok: true, service: "merchant-requests" }));
  app.get("/health/monitor", (_req, res) =>
    res.json({ ok: true, service: "merchant-requests-service", message: "probe_ok" }));
  app.use(
    "/merchant-requests/todoist/webhook",
    express.raw({ type: "*/*", limit: "1mb" }),
    webhookRouter,
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(
    "/merchant-requests",
    buildAuthMiddleware(config),
    requestsRouter,
  );

  app.use((err, _req, res, _next) => {
    const status = err.statusCode || err.status || 500;
    if (status >= 500) console.error("[merchant-requests] route error", err);
    res.status(status).json({
      error: err.message || "internal_server_error",
      ...(err.details || {}),
      ...(err.valid ? { valid: err.valid } : {}),
    });
  });

  return {
    app,
    config,
    todoistClient,
    buildHealthMonitorRegistrationPayload() {
      return {
        serviceName: "merchant-requests-service",
        baseUrl: "http://merchant-requests-service:4020",
        healthEndpoint: "/health",
        dependencies: ["mongo"],
        endpoints: [
          { path: "/health", method: "GET", critical: true, intervalSeconds: 30, successStatusFamily: "2xx" },
          { path: "/health/monitor", method: "GET", critical: true, intervalSeconds: 60, successStatusFamily: "2xx" },
        ],
        discoveredRoutes: [
          ...collectRoutes(app, { sourceModule: "src/app.js" }),
          ...collectRoutes(webhookRouter, {
            mountPath: "/merchant-requests/todoist/webhook",
            sourceModule: "src/routes/webhook.js",
          }),
          ...collectRoutes(requestsRouter, {
            mountPath: "/merchant-requests",
            sourceModule: "src/routes/requests.js",
            mountMiddlewareNames: ["buildAuthMiddleware"],
          }),
        ],
      };
    },
  };
}

module.exports = { buildApp };
