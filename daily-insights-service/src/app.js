require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { getConfig } = require("./config");
const { buildAuthMiddleware } = require("./middleware/auth");
const { buildDailyInsightsRouter } = require("./routes/dailyInsights");

function buildApp(overrides = {}) {
  const config = overrides.config || getConfig();
  const dailyInsightsRouter = buildDailyInsightsRouter({
    brandContext: overrides.brandContext,
    config,
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

  app.get("/health", (_req, res) => res.json({ ok: true, service: "daily-insights" }));
  app.get("/health/monitor", (_req, res) =>
    res.json({ ok: true, service: "daily-insights-service", message: "probe_ok" }));

  app.use(express.json({ limit: "1mb" }));
  app.use("/daily-insights", buildAuthMiddleware(config), dailyInsightsRouter);

  app.use((err, _req, res, _next) => {
    const status = err.statusCode || err.status || 500;
    if (status >= 500) console.error("[daily-insights] route error", err);
    res.status(status).json({ error: err.message || "internal_server_error" });
  });

  return { app, config };
}

module.exports = { buildApp };
