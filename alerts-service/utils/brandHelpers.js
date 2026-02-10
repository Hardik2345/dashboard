const { getBrands } = require('../config/brands');

function requireBrandKey(keyRaw) {
  const key = (keyRaw || '').toString().trim().toUpperCase();
  if (!key) return { error: 'brand_key required' };
  const map = getBrands();
  const cfg = map[key];
  if (!cfg) return { error: `Unknown brand_key ${key}` };
  const brandId = Number(cfg.brandId);
  if (!Number.isFinite(brandId)) return { error: `brand_id not configured for ${key}` };
  return { key, brandId };
}

module.exports = { requireBrandKey };
