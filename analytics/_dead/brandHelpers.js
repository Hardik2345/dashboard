// DEAD CODE — quarantined 2026-04-03
// Original: utils/brandHelpers.js
// Reason: requireBrandKey() has zero callers. Brand resolution is now handled
//         entirely by brandContext middleware + tenantRouterClient.
// Action: Verify no callers emerge, then delete this file.

const { getBrands } = require('../config/brands');

function requireBrandKey(keyRaw) {
  const key = (keyRaw || '').toString().trim().toUpperCase();
  if (!key) return { error: 'brand_key required' };
  const map = getBrands();
  const cfg = map[key];
  if (!cfg) return { error: `Unknown brand_key ${key}` };
  return { key, cfg };
}

module.exports = { requireBrandKey };
