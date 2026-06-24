if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const logger = require("./shared/utils/logger");
const {
  initObservability,
  sentryErrorMiddleware,
  captureError,
} = require("./observability");
const { connectMongo } = require("./shared/db/mongo");
const { sequelize } = require("./shared/db/mainSequelize");
const { buildMetricsRouter } = require("./modules/metrics");
const { buildProductConversionRouter } = require("./modules/product-conversion");
const { buildBundlesRouter } = require("./modules/bundles");
const { buildExternalRouter } = require("./modules/external");
const { buildUploadsRouter } = require("./modules/uploads");
const { buildApiKeysRouter } = require("./modules/api-keys");
const { buildShopifyRouter } = require("./modules/shopify");
const { buildNotificationsRouter } = require("./modules/notifications");
const { buildDashboardRouter } = require("./modules/dashboard");
const { buildSessionAnalyticsRouter } = require("./routes/sessionAnalytics.routes");

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
initObservability(app);

app.get("/health", (_req, res) => res.json({ ok: true, service: "analytics" }));

const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (!allowedOrigins.length || allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "60mb" }));

app.get("/", (_req, res) => {
  res.json({ message: "datum backend is running" });
});

app.use("/metrics", buildMetricsRouter(sequelize));
app.use("/metrics", buildProductConversionRouter());
app.use("/metrics", buildBundlesRouter());
app.use("/dashboard", buildDashboardRouter());
app.use("/session-analytics", buildSessionAnalyticsRouter());
app.use("/external", buildExternalRouter());
app.use("/", buildUploadsRouter());
app.use("/", buildApiKeysRouter(sequelize));
app.use("/shopify", buildShopifyRouter(sequelize));
app.use("/notifications", buildNotificationsRouter());
app.use(sentryErrorMiddleware);
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  logger.error("[analytics] unhandled route error", err);
  return res.status(500).json({ error: "Internal Server Error" });
});

async function init() {
  await sequelize.authenticate();
  await connectMongo();
  try {
    await sequelize.models.api_keys.sync();
  } catch (err) {
    logger.warn("API keys sync skipped", { error: err?.message || String(err) });
  }

  const port = process.env.PORT || 3000;
  const { initSocket } = require('./utils/socket');
  
  const server = app.listen(port, () => {
    logger.info(`Metrics API running on :${port}`);
    require("./config/brands")
      .fetchBrandIds()
      .catch((err) => {
        captureError(err, null, { type: "startup_brand_ids" });
        logger.warn("Failed to load dynamic brand IDs on startup", {
          error: err.message,
        });
      });
  });

  return server;
}

module.exports = {
  app,
  init,
  sequelize,
};
