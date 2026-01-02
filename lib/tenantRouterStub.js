const { getBrands } = require('../config/brands');
const logger = require('../utils/logger');

/**
 * Basic placeholder tenant router.
 * Given a brandId/key, returns a routing descriptor pointing to the configured DB name.
 * This is intentionally simple and can later be replaced with a real router/CDS lookup.
 */
function resolveTenant(brandId) {
  const key = (brandId || '').toString().trim().toUpperCase();
  if (!key) return null;

  const brands = getBrands();
  const cfg = brands[key];
  if (!cfg) {
    logger.warn('[tenant-router-stub] unknown brandId', { brandId: key });
    return null;
  }

  const route = {
    brandId: key,
    shardId: cfg.shardId || null,
    dbName: cfg.dbName || key,
    dbHost: cfg.dbHost || null,
    dbPort: cfg.dbPort || null,
    cacheKey: `brand:${key}`,
  };

  logger.info('[tenant-router-stub] resolved', route);
  return route;
}

module.exports = { resolveTenant };
