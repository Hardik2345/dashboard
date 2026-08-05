let Sentry = null;
let promClient = null;

try {
  Sentry = require("@sentry/node");
} catch {
  Sentry = null;
}

try {
  promClient = require("prom-client");
} catch {
  promClient = null;
}

const SERVICE_NAME = process.env.SERVICE_NAME || "alerts-service";
const METRICS_ENABLED = String(process.env.METRICS_ENABLED || "false").toLowerCase() === "true";
const METRICS_AUTH_TOKEN = process.env.METRICS_AUTH_TOKEN || "";

let sentryEnabled = false;
let httpRequests = null;
let httpDuration = null;
let appErrors = null;
let fcmSendTotal = null;
let fcmRegisteredTokens = null;
let fcmInvalidTokensRemovedTotal = null;
let alertConfigPublishTotal = null;
let inventoryCacheRefreshLastSuccess = null;
let inventoryCacheRefreshFailuresTotal = null;
let inventoryEventIngestTotal = null;
let mongoConnectionErrorsTotal = null;
let mysqlConnectionErrorsTotal = null;
let redisConnectionErrorsTotal = null;

function scrubEvent(event) {
  const headers = event?.request?.headers;
  if (headers) {
    delete headers.authorization;
    delete headers.Authorization;
    delete headers.cookie;
    delete headers.Cookie;
    delete headers["x-pipeline-key"];
    delete headers["x-push-token"];
  }
  return event;
}

function initSentry() {
  if (!Sentry || !process.env.SENTRY_DSN || sentryEnabled) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
    beforeSend: scrubEvent,
  });
  sentryEnabled = true;
}

function initMetrics() {
  if (!promClient || !METRICS_ENABLED || httpRequests) return;
  promClient.collectDefaultMetrics({ labels: { service: SERVICE_NAME } });
  httpRequests = new promClient.Counter({
    name: "http_requests_total",
    help: "Total HTTP requests.",
    labelNames: ["service", "route", "method", "status"],
  });
  httpDuration = new promClient.Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds.",
    labelNames: ["service", "route", "method", "status"],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  });
  appErrors = new promClient.Counter({
    name: "app_errors_total",
    help: "Total application errors.",
    labelNames: ["service", "type"],
  });
  fcmSendTotal = new promClient.Counter({
    name: "fcm_send_total",
    help: "FCM send attempts by result.",
    labelNames: ["result"],
  });
  fcmRegisteredTokens = new promClient.Gauge({
    name: "fcm_registered_tokens",
    help: "Registered FCM tokens.",
  });
  fcmInvalidTokensRemovedTotal = new promClient.Counter({
    name: "fcm_invalid_tokens_removed_total",
    help: "Invalid FCM tokens removed.",
  });
  alertConfigPublishTotal = new promClient.Counter({
    name: "alert_config_publish_total",
    help: "Alert config event publish attempts by target and result.",
    labelNames: ["target", "result"],
  });
  inventoryCacheRefreshLastSuccess = new promClient.Gauge({
    name: "inventory_cache_refresh_last_success_timestamp_seconds",
    help: "Last successful inventory cache refresh timestamp by brand.",
    labelNames: ["brand"],
  });
  inventoryCacheRefreshFailuresTotal = new promClient.Counter({
    name: "inventory_cache_refresh_failures_total",
    help: "Inventory cache refresh failures by brand.",
    labelNames: ["brand"],
  });
  inventoryEventIngestTotal = new promClient.Counter({
    name: "inventory_event_ingest_total",
    help: "Inventory event ingest attempts by result.",
    labelNames: ["result"],
  });
  mongoConnectionErrorsTotal = new promClient.Counter({
    name: "mongo_connection_errors_total",
    help: "Mongo connection errors by service.",
    labelNames: ["service"],
  });
  mysqlConnectionErrorsTotal = new promClient.Counter({
    name: "mysql_connection_errors_total",
    help: "MySQL connection errors by service and brand.",
    labelNames: ["service", "brand_key"],
  });
  redisConnectionErrorsTotal = new promClient.Counter({
    name: "redis_connection_errors_total",
    help: "Redis connection errors by service.",
    labelNames: ["service"],
  });
}

function routeLabel(req) {
  const routePath = req.route?.path;
  if (routePath) return `${req.baseUrl || ""}${routePath}`;
  return req.path || req.originalUrl?.split("?")[0] || "unknown";
}

function metricsMiddleware(req, res, next) {
  if (!promClient || !httpRequests) return next();
  if (req.path === "/metrics") return next();
  const started = process.hrtime.bigint();
  res.on("finish", () => {
    const durationSeconds = Number(process.hrtime.bigint() - started) / 1e9;
    const labels = {
      service: SERVICE_NAME,
      route: routeLabel(req),
      method: req.method,
      status: String(res.statusCode),
    };
    httpRequests.inc(labels);
    httpDuration.observe(labels, durationSeconds);
  });
  return next();
}

async function metricsHandler(req, res) {
  if (!promClient || !METRICS_ENABLED) return res.status(404).json({ error: "metrics_disabled" });
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : req.headers["x-metrics-token"];
  if (!METRICS_AUTH_TOKEN || token !== METRICS_AUTH_TOKEN) {
    return res.status(401).json({ error: "unauthorized_metrics" });
  }
  res.set("Content-Type", promClient.register.contentType);
  return res.send(await promClient.register.metrics());
}

function captureError(err, req, extra = {}) {
  if (appErrors) appErrors.inc({ service: SERVICE_NAME, type: extra.type || "exception" });
  if (!Sentry || !sentryEnabled || !err) return;
  Sentry.withScope((scope) => {
    scope.setTag("service", SERVICE_NAME);
    if (req) {
      scope.setTag("route", routeLabel(req));
      scope.setTag("method", req.method);
      const brandKey = req.body?.brand_key || req.body?.shop_domain || req.headers?.["x-brand-id"];
      if (brandKey) scope.setTag("brand_key", String(brandKey).toUpperCase());
    }
    Object.entries(extra).forEach(([key, value]) => scope.setExtra(key, value));
    Sentry.captureException(err);
  });
}

function sentryErrorMiddleware(err, req, _res, next) {
  captureError(err, req);
  return next(err);
}

function setupProcessHandlers() {
  process.on("uncaughtException", (err) => captureError(err, null, { type: "uncaughtException" }));
  process.on("unhandledRejection", (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    captureError(err, null, { type: "unhandledRejection" });
  });
}

function recordFcmSend(result) {
  if (fcmSendTotal) fcmSendTotal.inc({ result });
}

function setFcmRegisteredTokens(count) {
  if (fcmRegisteredTokens) fcmRegisteredTokens.set(Number(count || 0));
}

function recordFcmInvalidTokensRemoved(count = 1) {
  if (fcmInvalidTokensRemovedTotal) fcmInvalidTokensRemovedTotal.inc(Number(count || 1));
}

function recordAlertConfigPublish(target, result) {
  if (alertConfigPublishTotal) alertConfigPublishTotal.inc({ target, result });
}

function recordInventoryCacheRefreshSuccess(brand) {
  if (inventoryCacheRefreshLastSuccess) {
    inventoryCacheRefreshLastSuccess.set({ brand: String(brand || "unknown") }, Date.now() / 1000);
  }
}

function recordInventoryCacheRefreshFailure(brand) {
  if (inventoryCacheRefreshFailuresTotal) {
    inventoryCacheRefreshFailuresTotal.inc({ brand: String(brand || "unknown") });
  }
}

function recordInventoryEventIngest(result) {
  if (inventoryEventIngestTotal) inventoryEventIngestTotal.inc({ result });
}

function recordMongoConnectionError() {
  if (mongoConnectionErrorsTotal) mongoConnectionErrorsTotal.inc({ service: SERVICE_NAME });
}

function recordMysqlConnectionError(brandKey = "unknown") {
  if (mysqlConnectionErrorsTotal) {
    mysqlConnectionErrorsTotal.inc({
      service: SERVICE_NAME,
      brand_key: String(brandKey || "unknown").toUpperCase(),
    });
  }
}

function recordRedisConnectionError() {
  if (redisConnectionErrorsTotal) redisConnectionErrorsTotal.inc({ service: SERVICE_NAME });
}

function initObservability(app) {
  initSentry();
  initMetrics();
  setupProcessHandlers();
  if (app) {
    app.use(metricsMiddleware);
    app.get("/metrics", metricsHandler);
  }
}

module.exports = {
  initObservability,
  sentryErrorMiddleware,
  captureError,
  recordFcmSend,
  setFcmRegisteredTokens,
  recordFcmInvalidTokensRemoved,
  recordAlertConfigPublish,
  recordInventoryCacheRefreshSuccess,
  recordInventoryCacheRefreshFailure,
  recordInventoryEventIngest,
  recordMongoConnectionError,
  recordMysqlConnectionError,
  recordRedisConnectionError,
};
