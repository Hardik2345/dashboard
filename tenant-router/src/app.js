require("express-async-errors");
const express = require("express");
const tenantRoutes = require("./routes/tenant.routes");
const pipelineRoutes = require("./routes/pipeline.routes");
const mongoose = require("mongoose");
const Tenant = require("./models/tenant.model");
const { TenantError } = require("./utils/errors");
const {
  initObservability,
  sentryErrorMiddleware,
} = require("./observability");

const app = express();

app.use(express.json());
initObservability(app);

// Routes
app.use("/tenant", tenantRoutes);
app.use("/tenant/pipeline", pipelineRoutes);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", service: "tenant-router" });
});
app.get("/health/monitor", async (_req, res) => {
  const dependencies = {
    mongo: {
      status: "DOWN",
      message: "mongo_not_connected",
    },
  };

  try {
    if (mongoose.connection.readyState !== 1) {
      throw new Error("mongo_not_connected");
    }
    await Tenant.findOne({}).select("_id").lean();
    dependencies.mongo = {
      status: "UP",
      message: "query_ok",
    };
    return res.status(200).json({
      ok: true,
      service: "tenant-router",
      message: "dependencies_healthy",
      dependencies,
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      service: "tenant-router",
      message: error.message,
      dependencies,
    });
  }
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
