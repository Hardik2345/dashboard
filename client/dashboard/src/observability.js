import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN;
const environment =
  import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE || "development";
const release = import.meta.env.VITE_SENTRY_RELEASE;

const CRITICAL_API_PREFIXES = [
  "/auth/",
  "/metrics/summary",
  "/metrics/hourly-trend",
  "/metrics/product-conversion",
  "/metrics/bundles",
  "/alerts",
  "/push/",
  "/tenant/",
  "/sessions",
];

export function initFrontendObservability() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || 0),
    beforeSend(event) {
      const headers = event?.request?.headers;
      if (headers) {
        delete headers.authorization;
        delete headers.Authorization;
        delete headers.cookie;
        delete headers.Cookie;
        delete headers["x-refresh-token"];
      }
      return event;
    },
  });
  Sentry.setTag("service", "dashboard-frontend");
}

export function setFrontendUserContext(user, brandKey) {
  if (!dsn) return;
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({
    id: String(user.id || user._id || ""),
    email: user.email || undefined,
  });
  Sentry.setTag("role", user.isAuthor || user.role === "author" ? "author" : "viewer");
  if (brandKey) Sentry.setTag("brand_key", String(brandKey).toUpperCase());
}

export function captureFrontendError(error, context = {}) {
  if (!dsn || !error) return;
  Sentry.withScope((scope) => {
    Object.entries(context).forEach(([key, value]) => {
      if (value !== undefined && value !== null) scope.setExtra(key, value);
    });
    Sentry.captureException(error);
  });
}

export function isCriticalApiPath(path) {
  return CRITICAL_API_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function captureApiFailure(path, details = {}) {
  if (!dsn || !isCriticalApiPath(path)) return;
  Sentry.withScope((scope) => {
    scope.setTag("service", "dashboard-frontend");
    scope.setTag("api_path", path);
    if (details.status) scope.setTag("status", String(details.status));
    if (details.brandKey) {
      scope.setTag("brand_key", String(details.brandKey).toUpperCase());
    }
    scope.setExtra("api_error", {
      path,
      status: details.status || null,
      method: details.method || "GET",
    });
    Sentry.captureException(new Error(`Critical API failure: ${path}`));
  });
}
