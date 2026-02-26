const axios = require('axios');
const crypto = require('crypto');
const { LRUCache } = require('lru-cache');
const logger = require('../utils/logger');

const CACHE_TTL_MS = Number(process.env.TENANT_ROUTER_CACHE_TTL_MS || 300_000); // 5 minutes
const CACHE_MAX = Number(process.env.TENANT_ROUTER_CACHE_SIZE || 200);
const cache = new LRUCache({
  max: CACHE_MAX,
  ttl: CACHE_TTL_MS,
  updateAgeOnGet: true,
});

function decryptPassword(enc) {
  if (!enc) return '';
  const key = process.env.PASSWORD_AES_KEY;
  if (!key) {
    logger.error('[tenantRouterClient] PASSWORD_AES_KEY not set; cannot decrypt password');
    return '';
  }
  try {
    let buf = Buffer.from(key);
    if (buf.length < 32) {
      const padded = Buffer.alloc(32);
      buf.copy(padded);
      buf = padded;
    } else if (buf.length > 32) {
      buf = buf.slice(0, 32);
    }
    const parts = enc.split(':');
    if (parts.length !== 2) return '';
    const iv = Buffer.from(parts[0], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', buf, iv);
    let dec = decipher.update(parts[1], 'base64', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch (e) {
    logger.error('[tenantRouterClient] password decrypt failed', { err: e.message });
    return '';
  }
}

/**
 * Try to resolve tenant DB credentials from environment variables.
 * Looks for {BRAND}_DB_HOST, {BRAND}_DB_USER, {BRAND}_DB_PASS, etc.
 * Returns route object if all required vars are present, null otherwise.
 */
function resolveFromEnv(brandKey) {
  const prefix = brandKey.toUpperCase();
  const host = process.env[`${prefix}_DB_HOST`];
  const user = process.env[`${prefix}_DB_USER`];
  const pass = process.env[`${prefix}_DB_PASS`];
  const dbName = process.env[`${prefix}_DB_NAME`] || brandKey;
  const port = Number(process.env[`${prefix}_DB_PORT`] || 3306);

  if (host && user && pass) {
    return { brandId: brandKey, host, port, user, password: pass, dbName };
  }
  return null;
}

/**
 * Resolve tenant routing.
 * Priority: 1) LRU cache  2) Env vars  3) HTTP tenant-router service (MongoDB-backed).
 * Returns {route} or {error: 'not_found'|'suspended'|'unavailable'}.
 */
async function resolveTenantRoute(brandKey) {
  const key = (brandKey || '').toString().trim().toUpperCase();
  if (!key) return { error: 'missing_brand' };

  const cached = cache.get(key);
  if (cached) {
    logger.debug?.('[tenantRouterClient] cache hit', { brand: key, host: cached.host });
    return cached;
  }

  // --- Priority 2: Env-var based resolution (no network call) ---
  const envRoute = resolveFromEnv(key);
  if (envRoute) {
    logger.info('[tenantRouterClient] resolved from ENV vars', { brand: key, host: envRoute.host, db: envRoute.dbName });
    cache.set(key, envRoute);
    return envRoute;
  }

  // --- Priority 3: HTTP call to tenant-router (MongoDB-backed CDS) ---
  const baseUrl = (process.env.TENANT_ROUTER_URL || 'http://localhost:3004').replace(/\/+$/, '');
  const token = process.env.TENANT_ROUTER_TOKEN || '';

  try {
    const res = await axios.post(
      `${baseUrl}/tenant/resolve`,
      { brand_id: key },
      {
        timeout: Number(process.env.TENANT_ROUTER_TIMEOUT_MS || 5000),
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }
    );
    const data = res.data || {};
    const password = decryptPassword(data.password);
    const route = {
      brandId: key,
      dbName: data.database || key,
      host: data.rds_proxy_endpoint,
      port: Number(data.port || 3306),
      user: data.user || '',
      password,
    };
    if (!route.host || !route.user || !route.password) {
      logger.error('[tenantRouterClient] incomplete route from tenant router', { brand: key });
      return { error: 'routing_unavailable' };
    }
    logger.info('[tenantRouterClient] resolved route via HTTP', { brand: key, host: route.host, db: route.dbName });
    cache.set(key, route);
    return route;
  } catch (err) {
    const status = err?.response?.status;
    if (status === 404) return { error: 'not_found' };
    if (status === 403) return { error: 'suspended' };
    logger.error('[tenantRouterClient] resolve failed', { brand: key, err: err.message, status });
    return { error: 'routing_unavailable' };
  }
}

module.exports = { resolveTenantRoute };
