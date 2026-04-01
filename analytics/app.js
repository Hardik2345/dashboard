if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { Sequelize, DataTypes } = require("sequelize");
const logger = require("./utils/logger");
const { buildMetricsRouter } = require("./routes/metrics");
const { buildExternalRouter } = require("./routes/external");
const { buildRanvirRouter } = require("./routes/ranvir");
const { buildUploadsRouter } = require("./routes/uploads");
const { buildApiKeysRouter } = require("./routes/apiKeys");
const { buildShopifyRouter } = require("./routes/shopify");
const { buildNotificationsRouter } = require("./routes/notifications");

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

const DB_HOST = process.env.DB_PROXY_HOST || process.env.DB_HOST;
const DB_PORT = Number(process.env.DB_PROXY_PORT || process.env.DB_PORT || 3306);

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: DB_HOST,
    port: DB_PORT,
    dialect: "mysql",
    dialectModule: require("mysql2"),
    timezone: "+00:00",
    pool: {
      max: Number(process.env.DB_POOL_MAX || 1),
      min: Number(process.env.DB_POOL_MIN || 0),
      idle: Number(process.env.DB_POOL_IDLE || 2000),
      acquire: Number(process.env.DB_POOL_ACQUIRE || 30000),
      evict: Number(process.env.DB_POOL_EVICT || 1000),
    },
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
      connectAttributes: {
        program_name: "dashboard-main",
        service: "dashboard-api",
        env: process.env.NODE_ENV || "development",
      },
    },
  },
);

sequelize.define(
  "api_keys",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    brand_key: { type: DataTypes.STRING(32), allowNull: false },
    key_hash: { type: DataTypes.STRING(255), allowNull: false },
    sha256_hash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
    permissions: { type: DataTypes.JSON, allowNull: true },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
    last_used_at: { type: DataTypes.DATE, allowNull: true },
    expires_at: { type: DataTypes.DATE, allowNull: true },
    is_active: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    created_by_email: { type: DataTypes.STRING(255), allowNull: true },
  },
  {
    tableName: "api_keys",
    timestamps: false,
    indexes: [
      { fields: ["brand_key"], name: "idx_brand_key" },
      { fields: ["sha256_hash"], name: "idx_sha256_hash" },
      { fields: ["is_active"], name: "idx_is_active" },
    ],
  },
);

app.get("/", (_req, res) => {
  res.json({ message: "datum backend is running" });
});

app.use("/metrics", buildMetricsRouter(sequelize));
app.use("/external", buildExternalRouter());
app.use("/", buildUploadsRouter());
app.use("/", buildApiKeysRouter(sequelize));
app.use("/shopify", buildShopifyRouter(sequelize));
app.use("/notifications", buildNotificationsRouter());
app.use("/ranvir", buildRanvirRouter());
app.use("/analytics/ranvir", buildRanvirRouter());

async function init() {
  await sequelize.authenticate();
  try {
    await sequelize.models.api_keys.sync();
  } catch (err) {
    logger.warn("API keys sync skipped", { error: err?.message || String(err) });
  }

  const port = process.env.PORT || 3000;
  const { initSocket, emitKafkaMessage } = require('./utils/socket');
  
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
