// Load per-brand database configuration from environment.
// Option A (legacy): BRAND_LIST = comma-separated list of brand keys (e.g. PTS,BBB)
//   For each BRAND expect env vars:
//     <BRAND>_DB_HOST, <BRAND>_DB_PORT (optional, default 3306), <BRAND>_DB_USER, <BRAND>_DB_PASS, <BRAND>_DB_NAME (optional; default BRAND)
// Option B (new): BRANDS_CONFIG = JSON array of brand objects
//   e.g. [{"key":"PTS","dbHost":"...","dbPort":3306,"dbUser":"...","dbPass":"...","dbName":"PTS"}]

const REQUIRED_SUFFIXES = ['DB_HOST', 'DB_USER', 'DB_PASS'];
const axios = require('axios');

let DEFAULT_BRAND_IDS = {
  PTS: 1,
  BBB: 2,
  TMC: 3,
  AJMAL: 4,
  NEULIFE: 5,
  VAMA: 6,
};

const fetchBrandIds = async () => {
  try {
    const baseUrl = process.env.TENANT_ROUTER_URL || "http://tenant-router-main:3004";
    const res = await axios.get(`${baseUrl}/tenant/brands`, { timeout: 5000 });
    const data = res.data; // Expected { "1": "PTS", "2": "BBB", ... }
    const output = {};
    for (const [num, id] of Object.entries(data)) {
      if (id && num) {
        output[id.toString().toUpperCase()] = Number(num);
      }
    }
    if (Object.keys(output).length > 0) {
      DEFAULT_BRAND_IDS = Object.freeze(output);
      // Reload in-memory brands to apply new IDs
      brands = loadBrands();
      console.log('[Brands Config] Dynamic brand IDs loaded:', DEFAULT_BRAND_IDS);
    }
  } catch (e) {
    console.error('[Brands Config] Failed to fetch dynamic brand ids:', e.message);
  }
};

function loadBrands() {
  const map = {};
  if (process.env.BRANDS_CONFIG) {
    try {
      const arr = JSON.parse(process.env.BRANDS_CONFIG);
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (!item || !item.key) continue;
          const upper = String(item.key).toUpperCase();
          if (upper === 'MILA') continue; // EXPLICIT REMOVAL
          const fallbackId = DEFAULT_BRAND_IDS[upper];
          map[upper] = {
            key: upper,
            dbHost: item.dbHost,
            dbPort: Number(item.dbPort || 3306),
            dbUser: item.dbUser,
            dbPass: item.dbPass,
            dbName: item.dbName || upper,
            brandId: item.brandId != null && item.brandId !== ''
              ? Number(item.brandId)
              : (fallbackId !== undefined ? fallbackId : undefined),
          };
        }
      }
    } catch (e) {
      console.error('Failed to parse BRANDS_CONFIG JSON:', e.message);
    }
  }
  const legacyList = (process.env.BRAND_LIST || '').split(',').map(s => s.trim()).filter(Boolean);
  for (const key of legacyList) {
    const upper = key.toUpperCase();
    if (upper === 'MILA') continue; // EXPLICIT REMOVAL
    for (const suf of REQUIRED_SUFFIXES) {
      const varName = `${upper}_${suf}`;
      if (!process.env[varName]) {
        throw new Error(`Missing env var ${varName} for brand ${upper}`);
      }
    }
    if (!map[upper]) { // don't override JSON config
      const fallbackId = DEFAULT_BRAND_IDS[upper];
      map[upper] = {
        key: upper,
        dbHost: process.env[`${upper}_DB_HOST`],
        dbPort: Number(process.env[`${upper}_DB_PORT`] || 3306),
        dbUser: process.env[`${upper}_DB_USER`],
        dbPass: process.env[`${upper}_DB_PASS`],
        dbName: process.env[`${upper}_DB_NAME`] || upper,
        brandId: process.env[`${upper}_BRAND_ID`]
          ? Number(process.env[`${upper}_BRAND_ID`])
          : (fallbackId !== undefined ? fallbackId : undefined),
      };
    }
  }
  return map;
}

let brands = loadBrands();

function getBrands() { return { ...brands }; }

let dynamicBrandsMapCache = { map: null, timestamp: 0 };
const DYNAMIC_BRANDS_CACHE_TTL_MS = 5 * 60 * 1000;

// Full brand-key universe from the tenant-router's live registry (its
// /tenant/brands endpoint, backed by the tenants collection in Mongo) —
// used by admin cross-brand features (Overall Snapshot, Web Vitals) to
// decide "all brands" for an author/admin user. Distinct from getBrands()
// above, which is the legacy static per-brand DB-credential map sourced
// from BRAND_LIST/BRANDS_CONFIG env vars — some legacy direct-connect code
// (e.g. splitController's hourlySalesCompare) still depends on that one for
// its dbHost/dbUser/dbPass fields, so it's left untouched. This only needs
// brand-key presence, so it returns a plain { BRANDKEY: true, ... } map,
// shaped to drop straight into resolveAccessibleBrandKeys(user, brandsMap).
async function getDynamicBrandsMap() {
  const now = Date.now();
  if (dynamicBrandsMapCache.map && now - dynamicBrandsMapCache.timestamp < DYNAMIC_BRANDS_CACHE_TTL_MS) {
    return dynamicBrandsMapCache.map;
  }
  try {
    const baseUrl = process.env.TENANT_ROUTER_URL || "http://tenant-router-main:3004";
    const res = await axios.get(`${baseUrl}/tenant/brands`, { timeout: 5000 });
    const data = res.data || {};
    const map = {};
    for (const key of Object.values(data)) {
      const upper = String(key || "").trim().toUpperCase();
      if (upper && upper !== "MILA") map[upper] = true;
    }
    if (Object.keys(map).length > 0) {
      dynamicBrandsMapCache = { map, timestamp: now };
      return map;
    }
    return dynamicBrandsMapCache.map || getBrands();
  } catch (e) {
    console.error("[Brands Config] Failed to fetch dynamic brand list:", e.message);
    return dynamicBrandsMapCache.map || getBrands();
  }
}

function getBrandById(id) {
  if (id == null) return null;
  const numeric = Number(id);
  if (!Number.isFinite(numeric)) return null;
  const map = getBrands();
  return Object.values(map).find((b) => Number(b.brandId) === numeric) || null;
}

module.exports = { brands, getBrands, getBrandById, fetchBrandIds, getDynamicBrandsMap };
