const { resolveBrandFromEmail, getBrands } = require('../config/brands');
const { getBrandConnection } = require('../lib/brandConnectionManager');
const { resolveTenant } = require('../lib/tenantRouterStub');
const { getTenantConnection } = require('../lib/tenantDb');
const logger = require('../utils/logger');

const TENANT_ROUTING_ENABLED = String(process.env.TENANT_ROUTING_ENABLED || '').toLowerCase() === 'true';

async function authorizeBrandContext(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let brandCfg = null;
  let resolvedRoute = null;

  if (req.user.isAuthor) {
    const rawKey = (
      req.query?.brand_key ||
      req.headers['x-brand-key'] ||
      req.headers['x-brand-id'] ||
      req.body?.brand_key
    || '').toString().trim().toUpperCase();
    if (!rawKey) {
      return res.status(400).json({ error: 'brand_key required for author' });
    }
    // Resolve via stub (preferred) then fallback to static config map
    resolvedRoute = resolveTenant(rawKey);
    if (resolvedRoute) {
      brandCfg = { key: resolvedRoute.brandId, dbName: resolvedRoute.dbName };
    } else {
      const map = getBrands();
      brandCfg = map[rawKey] || null;
    }
    if (!brandCfg) {
      logger.warn('[brandContext] unknown author brand', { brand_key: rawKey });
      return res.status(404).json({ error: `Unknown brand_key ${rawKey}` });
    }
  } else {
    if (req.user.brandKey) {
      resolvedRoute = resolveTenant(req.user.brandKey);
      if (resolvedRoute) {
        brandCfg = { key: resolvedRoute.brandId, dbName: resolvedRoute.dbName };
      } else {
        const map = getBrands();
        brandCfg = map[req.user.brandKey] || null;
      }
    }
    if (!brandCfg && req.user.email) {
      brandCfg = resolveBrandFromEmail(req.user.email);
    }
    if (!brandCfg) {
      return res.status(403).json({ error: 'Unknown brand for user email' });
    }
  }
  // Attach routing context for downstream consumers
  if (!resolvedRoute) {
    resolvedRoute = resolveTenant(brandCfg.key);
  }
  req.tenant = resolvedRoute || {
    brandId: brandCfg.key,
    dbName: brandCfg.dbName || brandCfg.key,
    cacheKey: `brand:${brandCfg.key}`,
  };

  req.brandKey = brandCfg.key;
  req.brandDbName = brandCfg.dbName || brandCfg.key;
  req.brandConfig = brandCfg; // Store config for lazy connection
  next();
}

async function brandContext(req, res, next) {
  authorizeBrandContext(req, res, async () => {
     // If authorization passed, connect to DB
     try {
       if (!req.brandConfig) return next(); // Should trigger auth error if logic was skipped, but strict following prev logic
       if (TENANT_ROUTING_ENABLED && req.tenant) {
         req.brandDb = getTenantConnection(req.tenant);
       } else {
         req.brandDb = await getBrandConnection(req.brandConfig);
       }
       next();
     } catch (e) {
        console.error(`[brand=${req.brandConfig?.key}] DB connection error`, e.message);
        return res.status(503).json({ error: 'Brand database unavailable' });
     }
  });
}

module.exports = { brandContext, authorizeBrandContext };
