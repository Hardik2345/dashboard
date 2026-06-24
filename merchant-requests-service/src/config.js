const STATUSES = Object.freeze([
  "submitted",
  "triaged",
  "in_progress",
  "waiting_on_merchant",
  "resolved",
  "closed",
  "cancelled",
]);

function validateConfig(env = process.env) {
  if (env.NODE_ENV === "test" && env.SKIP_CONFIG_VALIDATION === "true") {
    return;
  }

  const required = ["MONGO_URI", "TODOIST_API_TOKEN", "TODOIST_CLIENT_SECRET"];
  const missing = required.filter((key) => !String(env[key] || "").trim());
  if (missing.length) {
    throw new Error(`Missing required merchant request config: ${missing.join(", ")}`);
  }
}

function getConfig(env = process.env) {
  return {
    port: Number(env.PORT || 4020),
    mongoUri: env.MONGO_URI || env.MONGODB_URI || "mongodb://localhost:27017/merchant_requests",
    mongoDb: env.MONGO_DB || "merchant_requests",
    corsOrigins: String(env.CORS_ORIGINS || env.CORS_ORIGIN || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    todoist: {
      apiToken: env.TODOIST_API_TOKEN || "",
      clientSecret: env.TODOIST_CLIENT_SECRET || "",
      projectNamePrefix: env.TODOIST_PROJECT_NAME_PREFIX || "Datum",
      reconcileIntervalMs: Number(env.TODOIST_RECONCILE_INTERVAL_MS || 300000),
      apiBaseUrl: env.TODOIST_API_BASE_URL || "https://api.todoist.com/api/v1",
    },
    gatewaySharedSecret: env.GATEWAY_SHARED_SECRET || "",
    // Escape hatch for local dev / tests only: when no GATEWAY_SHARED_SECRET is
    // set, trust gateway identity headers unsigned. Never enable in production.
    allowInsecureAuth: String(env.ALLOW_INSECURE_AUTH || "").toLowerCase() === "true",
    authKeys: env.AUTH_KEYS || "",
  };
}

module.exports = {
  STATUSES,
  getConfig,
  validateConfig,
};
