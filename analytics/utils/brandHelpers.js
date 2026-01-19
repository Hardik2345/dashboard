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
