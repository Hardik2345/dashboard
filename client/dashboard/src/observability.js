import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN;
const environment =
  import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE || "development";
const release = import.meta.env.VITE_SENTRY_RELEASE;
const clarityProjectId = import.meta.env.VITE_CLARITY_PROJECT_ID;
const CLARITY_PROD_HOST = "datum.trytechit.co";
const CLARITY_SCRIPT_ID = "datum-clarity-script";

let clarityInitialized = false;

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

function isClarityEnabled() {
  return (
    typeof window !== "undefined" &&
    window.location.hostname === CLARITY_PROD_HOST &&
    typeof clarityProjectId === "string" &&
    clarityProjectId.trim().length > 0
  );
}

function ensureClarityQueue() {
  if (typeof window === "undefined" || typeof window.clarity === "function") return;
  window.clarity = (...args) => {
    window.clarity.q = window.clarity.q || [];
    window.clarity.q.push(args);
  };
}

function loadClarityScript() {
  if (
    typeof document === "undefined" ||
    document.getElementById(CLARITY_SCRIPT_ID)
  ) {
    return;
  }

  const script = document.createElement("script");
  script.id = CLARITY_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${clarityProjectId.trim()}`;
  document.head.appendChild(script);
}

function setClarityTag(key, value) {
  if (!isClarityEnabled() || typeof window.clarity !== "function") return;
  if (value === undefined || value === null || value === "") return;
  window.clarity("set", key, String(value));
}

export function initFrontendObservability() {
  if (isClarityEnabled() && !clarityInitialized) {
    ensureClarityQueue();
    loadClarityScript();
    clarityInitialized = true;
  }

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
  if (isClarityEnabled() && typeof window.clarity === "function") {
    if (user?.id || user?._id) {
      window.clarity("identify", String(user.id || user._id));
      setClarityTag(
        "role",
        user.isAuthor || user.role === "author" ? "author" : "viewer",
      );
      if (brandKey) {
        setClarityTag("brand_key", String(brandKey).toUpperCase());
      }
    } else {
      setClarityTag("auth_state", "signed_out");
    }
  }

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
