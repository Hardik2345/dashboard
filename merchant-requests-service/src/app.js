require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { getConfig } = require("./config");
const { buildAuthMiddleware } = require("./middleware/auth");
const { buildRequestsRouter } = require("./routes/requests");
const { buildWebhookRouter } = require("./routes/webhook");
const { TodoistClient } = require("./services/todoistClient");

function buildApp(overrides = {}) {
  const config = overrides.config || getConfig();
  const todoistClient =
    overrides.todoistClient ||
    new TodoistClient({
      apiToken: config.todoist.apiToken,
      apiBaseUrl: config.todoist.apiBaseUrl,
    });

  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins.length ? config.corsOrigins : true,
      credentials: true,
    }),
  );

  app.get("/health", (_req, res) => res.json({ ok: true, service: "merchant-requests" }));
  app.use(
    "/merchant-requests/todoist/webhook",
    express.raw({ type: "*/*", limit: "1mb" }),
    buildWebhookRouter(config, { todoistClient }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(
    "/merchant-requests",
    buildAuthMiddleware(config),
    buildRequestsRouter({ config, todoistClient }),
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

  return { app, config, todoistClient };
}

module.exports = { buildApp };
