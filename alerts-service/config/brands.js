const DEFAULT_BRAND_IDS = Object.freeze({
  PTS: 1,
  BBB: 2,
  TMC: 3,
  MILA: 4,
});

function loadBrands() {
  const map = {};
  if (process.env.BRANDS_CONFIG) {
    try {
      const arr = JSON.parse(process.env.BRANDS_CONFIG);
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (!item || !item.key) continue;
          const key = String(item.key).trim().toUpperCase();
          const brandId = item.brandId != null ? Number(item.brandId) : DEFAULT_BRAND_IDS[key];
          map[key] = { key, brandId };
        }
      }
    } catch (e) {
      console.error('[brands] Failed to parse BRANDS_CONFIG', e.message);
    }
  }

  const list = (process.env.BRAND_LIST || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  for (const key of list) {
    const brandIdVar = process.env[`${key}_BRAND_ID`];
    const brandId = brandIdVar != null ? Number(brandIdVar) : DEFAULT_BRAND_IDS[key];
    map[key] = map[key] || { key, brandId };
  }

  return map;
}

let brands = loadBrands();

function getBrands() {
  return { ...brands };
}

function getBrandById(id) {
  if (id == null) return null;
  const num = Number(id);
  if (!Number.isFinite(num)) return null;
  const map = getBrands();
  return Object.values(map).find(b => Number(b.brandId) === num) || null;
}

module.exports = { getBrands, getBrandById };
