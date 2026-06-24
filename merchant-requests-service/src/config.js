const STATUSES = Object.freeze(["submitted", "assigned", "done"]);

const LEGACY_STATUS_MAP = Object.freeze({
  submitted: "submitted",
  triaged: "submitted",
  in_progress: "assigned",
  waiting_on_merchant: "assigned",
  resolved: "done",
  closed: "done",
  cancelled: "done",
});

const CATEGORIES = Object.freeze([
  "Design",
  "Data Analysis",
  "Development",
  "Issues",
  "Integrations",
  "Feature Request",
]);

const PRIORITIES = Object.freeze(["low", "normal", "high", "urgent"]);

const DEFAULT_PRIORITY_CAPS = Object.freeze({
  urgent: 1,
  high: 2,
  normal: 3,
  low: 5,
});

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
  CATEGORIES,
  DEFAULT_PRIORITY_CAPS,
  LEGACY_STATUS_MAP,
  PRIORITIES,
  STATUSES,
  getConfig,
  validateConfig,
};
