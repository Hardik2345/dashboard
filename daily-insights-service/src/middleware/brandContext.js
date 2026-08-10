const defaultResolveTenantRoute = require("../db/tenantRouterClient").resolveTenantRoute;
const defaultGetTenantConnection = require("../db/tenantConnection").getTenantConnection;
const defaultResolveDirectRoute = require("../db/directRoute").resolveDirectRoute;

function buildBrandContext({
  resolveTenantRoute = defaultResolveTenantRoute,
  getTenantConnection = defaultGetTenantConnection,
  resolveDirectRoute = defaultResolveDirectRoute,
} = {}) {
  return async function brandContext(req, res, next) {
    const rawKey = (
      req.headers["x-brand-id"] ||
      req.query?.brand_key ||
      req.body?.brand_key ||
      req.principal?.brand_key ||
      ""
    )
      .toString()
      .trim()
      .toUpperCase();

    if (!rawKey) {
      return res.status(400).json({ error: "missing_brand_key" });
    }

    // Prefer the direct write/read-replica hosts (DB_URL/READ_REPLICA_URL) when
    // configured; otherwise fall back to tenant-router brand DB resolution.
    const forWrite = req.method !== "GET";
    const route =
      resolveDirectRoute(rawKey, { forWrite }) || (await resolveTenantRoute(rawKey));

    if (route.error) {
      const status = route.error === "not_found" ? 404 : route.error === "suspended" ? 403 : 502;
      return res.status(status).json({ error: route.error });
    }

    req.brandKey = rawKey;
    req.brandDb = getTenantConnection(route);
    return next();
  };
}

module.exports = { buildBrandContext, brandContext: buildBrandContext() };
