const env = {
  PORT: Number(process.env.PORT || process.env.REPORTING_PORT || 4020),
  NODE_ENV: process.env.NODE_ENV || "development",
  MONGO_URI: process.env.MONGO_URI || "mongodb://localhost:27017",
  MONGO_DB: process.env.MONGO_DB || "reporting",
  REDIS_URL: process.env.REDIS_URL || "",
  GATEWAY_SHARED_SECRET: process.env.GATEWAY_SHARED_SECRET || "",
  REPORTING_PUBLIC_BASE_URL:
    (process.env.REPORTING_PUBLIC_BASE_URL || "http://localhost:8081").replace(/\/+$/, ""),
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  SMTP_FROM: process.env.SMTP_FROM || "reports@example.com",
  APPROVAL_TOKEN_SECRET: process.env.APPROVAL_TOKEN_SECRET || "dev-reporting-approval-secret",
  AI_ENABLED: String(process.env.AI_ENABLED || "false").toLowerCase() === "true",
  AI_PROVIDER: process.env.AI_PROVIDER || "openai",
  AI_MODEL: process.env.AI_MODEL || "",
  AI_TIMEOUT_MS: Number(process.env.AI_TIMEOUT_MS || 12000),
  AI_MAX_RETRIES: Number(process.env.AI_MAX_RETRIES || 1),
  ANALYTICS_SERVICE_URL:
    (process.env.ANALYTICS_SERVICE_URL || "http://analytics-service:3006").replace(/\/+$/, ""),
  SCHEDULER_ENABLED: String(process.env.SCHEDULER_ENABLED || "true").toLowerCase() !== "false",
};

module.exports = { env };
