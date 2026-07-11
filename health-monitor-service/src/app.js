const express = require("express");
const { buildRegisterRouter } = require("./routes/register");

function buildApp(deps) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "health-monitor-service" });
  });

  app.use(
    "/register",
    buildRegisterRouter({
      registryService: deps.registryService,
      schedulerService: deps.schedulerService,
      logger: deps.logger,
    }),
  );

  app.use((err, _req, res, _next) => {
    deps.logger.error("app.unhandled_error", { error: err.message });
    res.status(500).json({ error: "internal_server_error" });
  });

  return app;
}

module.exports = { buildApp };
