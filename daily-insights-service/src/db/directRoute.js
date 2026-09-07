// Direct (non tenant-router) brand DB resolution: all brand schemas live on
// shared write/read-replica hosts, selected per-request via `USE <brand_key>`.
// Used when DB_URL/DB_USER/DB_PASSWORD are configured; otherwise the caller
// should fall back to tenant-router (see brandContext.js).

function isDirectRouteConfigured(env = process.env) {
  return Boolean(env.DB_URL && env.DB_USER && env.DB_PASSWORD);
}

function resolveDirectRoute(brandKey, { forWrite = false } = {}, env = process.env) {
  if (!isDirectRouteConfigured(env)) return null;

  const host = forWrite ? env.DB_URL : env.READ_REPLICA_URL || env.DB_URL;

  return {
    brandId: brandKey,
    dbName: brandKey,
    host,
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  };
}

module.exports = { isDirectRouteConfigured, resolveDirectRoute };
