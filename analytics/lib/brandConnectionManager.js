const { resolveTenantRoute } = require('./tenantRouterClient');
const { getTenantConnection, closeAllTenantConnections } = require('./tenantConnection');
const logger = require('../utils/logger');

async function getBrandConnection(brandCfg) {
  const key = (brandCfg?.key || brandCfg || '').toString().trim().toUpperCase();
  if (!key) throw new Error('brand key required');

  const route = await resolveTenantRoute(key);
  if (!route) {
    logger.error('[brandConnectionManager] tenant route unavailable', { brand: key });
    throw new Error('Tenant routing unavailable');
  }
  return getTenantConnection(route);
}

async function closeAll() {
  await closeAllTenantConnections();
}

module.exports = { getBrandConnection, closeAll };
