if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const logger = require("./shared/utils/logger");
const { sequelize } = require("./shared/db/mainSequelize");
const { buildMetricsRouter } = require("./modules/metrics");
const { buildProductConversionRouter } = require("./modules/product-conversion");
const { buildExternalRouter } = require("./modules/external");
const { buildRanvirRouter } = require("./modules/ranvir");
const { buildUploadsRouter } = require("./modules/uploads");
const { buildApiKeysRouter } = require("./modules/api-keys");
const { buildShopifyRouter } = require("./modules/shopify");
const { buildNotificationsRouter } = require("./modules/notifications");

const app = express();
app.set("trust proxy", 1);
app.use(helmet());

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
app.use("/external", buildExternalRouter());
app.use("/", buildUploadsRouter());
app.use("/", buildApiKeysRouter(sequelize));
app.use("/shopify", buildShopifyRouter(sequelize));
app.use("/notifications", buildNotificationsRouter());
app.use("/ranvir", buildRanvirRouter());

async function init() {
  await sequelize.authenticate();
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
