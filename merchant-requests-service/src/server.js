require("dotenv").config();

const http = require("http");
const { validateConfig } = require("./config");
const { buildApp } = require("./app");
const { connectDB } = require("./db");
const { backfillMerchantRequestWorkflow } = require("./services/migrations");
const { ensureFallbackBrandConfig } = require("./services/brandProvisioning");
const { initSocket } = require("./services/socket");
const { reconcileTodoist } = require("./services/reconcileService");
const { registerWithHealthMonitor } = require("./healthMonitorRegistration");

async function start() {
  validateConfig();
  const { app, config, todoistClient } = buildApp();
  await connectDB(config);
  await backfillMerchantRequestWorkflow();
  await ensureFallbackBrandConfig({ todoistClient, config });

  if (!config.gatewaySharedSecret) {
    if (config.allowInsecureAuth) {
      console.warn(
        "[merchant-requests] WARNING: GATEWAY_SHARED_SECRET is unset and ALLOW_INSECURE_AUTH=true — gateway identity headers are trusted UNSIGNED. Dev/test only; never use in production.",
      );
    } else {
      console.warn(
        "[merchant-requests] GATEWAY_SHARED_SECRET is not set — all gateway requests will be rejected (401). Set the secret, or ALLOW_INSECURE_AUTH=true for local dev.",
      );
    }
  }

  const server = http.createServer(app);
  initSocket(server, config);

  server.listen(config.port, () => {
    console.log(`[merchant-requests] listening on :${config.port}`);
    registerWithHealthMonitor({
      serviceName: "merchant-requests-service",
      baseUrl: "http://merchant-requests-service:4020",
      healthEndpoint: "/health",
      endpoints: [
        {
          path: "/health",
          method: "GET",
          critical: true,
          intervalSeconds: 30,
          expectedStatus: 200,
        },
        {
          path: "/health/monitor",
          method: "GET",
          critical: true,
          intervalSeconds: 60,
          expectedStatus: 200,
        },
      ],
      dependencies: ["mongo"],
    }).catch(() => {});
  });

  const timer = setInterval(() => {
    reconcileTodoist({ todoistClient, config }).catch((err) => {
      console.error("[merchant-requests] reconcile failed", err.message);
    });
  }, config.todoist.reconcileIntervalMs);
  timer.unref?.();
}

start().catch((err) => {
  console.error("[merchant-requests] startup failed", err);
  process.exit(1);
});
