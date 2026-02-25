const { resolveTenantRoute } = require('../lib/tenantRouterClient');
const { getTenantConnection } = require('../lib/tenantConnection');
const logger = require('../utils/logger');

// Guard and attach tenant connection from router; fail closed if routing fails.
async function authorizeBrandContext(req, res, next) {
  if (!req.user && !req.apiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const rawKey = (
    req.headers['x-brand-id'] ||
    req.headers['x-brand-key'] ||
    req.query?.brand_key ||
    req.body?.brand_key ||
    req.user?.brandKey ||
    req.apiKey?.brandKey
    || '').toString().trim().toUpperCase();
  if (!rawKey) {
    return res.status(400).json({ error: 'brand_key required' });
  }
  const route = await resolveTenantRoute(rawKey);
  if (!route || route.error) {
    const code = route?.error;
    if (code === 'not_found') return res.status(404).json({ error: 'Unknown brand' });
    if (code === 'suspended') return res.status(403).json({ error: 'Brand suspended' });
    logger.warn('[brandContext] tenant route missing', { brand: rawKey, code });
    return res.status(503).json({ error: 'Tenant routing unavailable' });
  }
  try {
    req.brandKey = rawKey;
    req.brandDbName = route.dbName;
    req.tenantRoute = route;
    logger.info(`[brandContext] Querying data for ${rawKey} from DB Host: ${route.host}, Database: ${route.dbName}`);
    req.brandDb = getTenantConnection(route);
  } catch (e) {
    logger.error('[brandContext] tenant connection failed', { brand: rawKey, err: e.message });
    return res.status(503).json({ error: 'Database unavailable' });
  }
  return next();
}

async function brandContext(req, res, next) {
  authorizeBrandContext(req, res, next);
}

module.exports = { brandContext, authorizeBrandContext };
