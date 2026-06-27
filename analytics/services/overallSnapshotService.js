const { getBrands } = require("../config/brands");
const { resolveTenantRoute } = require("../shared/db/tenantRouterClient");
const { getTenantConnection } = require("../shared/db/tenantConnection");

const SUMMARY_METRIC_KEYS = Object.freeze([
  "total_orders",
  "total_sales",
  "average_order_value",
  "conversion_rate",
  "total_sessions",
  "total_atc_sessions",
  "total_ci_events",
  "checkout_rate",
  "atc_rate",
  "cancelled_orders",
  "refunded_orders",
]);

function humanizeBrandKey(brandKey) {
  const normalized = (brandKey || "").toString().trim().toUpperCase();
  if (!normalized) return "";
  return normalized.replace(/_/g, " ");
}

function getAllowedBrands(user = {}) {
  if (Array.isArray(user.allowedBrands) && user.allowedBrands.length > 0) {
    return [
      ...new Set(
        user.allowedBrands
          .map((brand) => String(brand || "").trim().toUpperCase())
          .filter(Boolean),
      ),
    ];
  }

  const memberships = Array.isArray(user.memberships)
    ? user.memberships
    : Array.isArray(user.brand_memberships)
      ? user.brand_memberships
      : [];
  const seen = new Set();
  const brands = [];

  for (const membership of memberships) {
    const key = (membership?.brand_id || membership?.brandId || "")
      .toString()
      .trim()
      .toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    brands.push(key);
  }

  if (brands.length > 0) return brands;

  const fallback = (user.brandKey || user.primary_brand_id || "")
    .toString()
    .trim()
    .toUpperCase();
  return fallback ? [fallback] : [];
}

function normalizeBrandKeys(values = []) {
  const seen = new Set();
  const out = [];
  const input = Array.isArray(values) ? values : [values];

  for (const value of input) {
    const normalized = String(value || "").trim().toUpperCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}

function resolveAccessibleBrandKeys(user = {}, brandsMap = getBrands(), requestedBrandKeys = []) {
  const requested = normalizeBrandKeys(requestedBrandKeys);

  if (user?.isAuthor) {
    if (requested.length > 0) {
      return requested.sort();
    }
    return Object.keys(brandsMap || {})
      .map((key) => String(key || "").trim().toUpperCase())
      .filter(Boolean)
      .sort();
  }

  const allowed = getAllowedBrands(user).sort();
  if (requested.length === 0) return allowed;
  const allowedSet = new Set(allowed);
  return requested.filter((brandKey) => allowedSet.has(brandKey)).sort();
}

function buildUnavailableBrandSnapshot(brandKey, error) {
  return {
    brand_key: brandKey,
    brand_name: humanizeBrandKey(brandKey),
    status: "unavailable",
    metrics: null,
    error: error || "unavailable",
  };
}

function buildSuccessfulBrandSnapshot(brandKey, summary) {
  return {
    brand_key: brandKey,
    brand_name: humanizeBrandKey(brandKey),
    status: "ready",
    metrics: summary?.metrics || null,
    sources: summary?.sources || null,
    prev_range: summary?.prev_range || null,
  };
}

function buildOverallSnapshotService({
  metricsService,
  resolveRoute = resolveTenantRoute,
  getConnection = getTenantConnection,
  getBrandsMap = getBrands,
} = {}) {
  if (!metricsService || typeof metricsService.getDashboardSummary !== "function") {
    throw new Error("metricsService.getDashboardSummary is required");
  }

  async function buildBrandSnapshot(brandKey, spec) {
    try {
      const route = await resolveRoute(brandKey);
      if (!route || route.error) {
        return buildUnavailableBrandSnapshot(brandKey, route?.error || "routing_unavailable");
      }

      const tenant = getConnection({ ...route, brandId: brandKey });
      const summary = await metricsService.getDashboardSummary({
        ...spec,
        brandKey,
        conn: tenant?.sequelize || null,
        timezone: route.timezone || spec.timezone,
      });

      return buildSuccessfulBrandSnapshot(brandKey, summary);
    } catch (error) {
      return buildUnavailableBrandSnapshot(brandKey, error?.message || "summary_failed");
    }
  }

  async function getOverallSnapshot({ user = {}, spec = {} }) {
    const accessibleBrandKeys = resolveAccessibleBrandKeys(
      user,
      getBrandsMap(),
      spec.brandKeys,
    );
    if (accessibleBrandKeys.length === 0) {
      return {
        range: { start: spec.start || null, end: spec.end || null },
        prev_range: null,
        metric_keys: SUMMARY_METRIC_KEYS,
        brands: [],
      };
    }

    const brands = await Promise.all(
      accessibleBrandKeys.map((brandKey) => buildBrandSnapshot(brandKey, spec)),
    );

    const firstSuccessful = brands.find((brand) => brand.metrics);
    return {
      range: { start: spec.start || null, end: spec.end || null },
      prev_range: firstSuccessful?.prev_range || null,
      metric_keys: SUMMARY_METRIC_KEYS,
      brands,
    };
  }

  return {
    getOverallSnapshot,
    getAllowedBrands,
    normalizeBrandKeys,
    resolveAccessibleBrandKeys,
  };
}

module.exports = {
  SUMMARY_METRIC_KEYS,
  buildOverallSnapshotService,
};
