// Load per-brand database configuration from environment.
// Option A (legacy): BRAND_LIST = comma-separated list of brand keys (e.g. PTS,MILA,BBB)
//   For each BRAND expect env vars:
//     <BRAND>_DB_HOST, <BRAND>_DB_PORT (optional, default 3306), <BRAND>_DB_USER, <BRAND>_DB_PASS, <BRAND>_DB_NAME (optional; default BRAND)
// Option B (new): BRANDS_CONFIG = JSON array of brand objects
//   e.g. [{"key":"PTS","dbHost":"...","dbPort":3306,"dbUser":"...","dbPass":"...","dbName":"PTS"}]

const REQUIRED_SUFFIXES = ['DB_HOST','DB_USER','DB_PASS'];
const DEFAULT_BRAND_IDS = Object.freeze({
  PTS: 1,
  BBB: 2,
  TMC: 3,
  MILA: 4,
});

function normalizeDomain(d) {
  return String(d || '').trim().toLowerCase();
}

function domainMatches(host, rule) {
  const h = normalizeDomain(host);
  const r = normalizeDomain(rule);
  if (!h || !r) return false;
  return h === r || h.endsWith('.' + r);
}

function loadBrands() {
  const map = {};
  if (process.env.BRANDS_CONFIG) {
    try {
      const arr = JSON.parse(process.env.BRANDS_CONFIG);
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (!item || !item.key) continue;
          const upper = String(item.key).toUpperCase();
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
            domains: Array.isArray(item.domains) ? item.domains.map(normalizeDomain).filter(Boolean) : [],
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
        domains: [],
      };
    }
  }
  return map;
}

let brands = loadBrands();

function addBrandRuntime(cfg) {
  const upper = cfg.key.toUpperCase();
  if (brands[upper]) throw new Error(`Brand ${upper} already exists`);
  const fallbackId = DEFAULT_BRAND_IDS[upper];
  const brandCfg = {
    key: upper,
    dbHost: cfg.dbHost,
    dbPort: Number(cfg.dbPort || 3306),
    dbUser: cfg.dbUser,
    dbPass: cfg.dbPass,
    dbName: cfg.dbName || upper,
    brandId: cfg.brandId != null
      ? Number(cfg.brandId)
      : (fallbackId !== undefined ? fallbackId : undefined),
  };
  brands[upper] = brandCfg;
  return brandCfg;
}

function getBrands() { return { ...brands }; }

function getBrandById(id) {
  if (id == null) return null;
  const numeric = Number(id);
  if (!Number.isFinite(numeric)) return null;
  const map = getBrands();
  return Object.values(map).find((b) => Number(b.brandId) === numeric) || null;
}

// Optional external mapping: BRAND_DOMAIN_MAP = JSON array [{ domain, brandKey }]
let externalDomainMap = [];
try {
  if (process.env.BRAND_DOMAIN_MAP) {
    const parsed = JSON.parse(process.env.BRAND_DOMAIN_MAP);
    if (Array.isArray(parsed)) externalDomainMap = parsed
      .map(e => ({ domain: normalizeDomain(e.domain), brandKey: String(e.brandKey || '').toUpperCase() }))
      .filter(e => e.domain && e.brandKey);
  }
} catch (e) {
  console.error('Failed to parse BRAND_DOMAIN_MAP JSON:', e.message);
}

function resolveBrandFromEmail(email) {
  if (!email || !email.includes('@')) return null;
  const [local, domain] = email.split('@');
  const d = normalizeDomain(domain);
  // 1) Try BRANDS_CONFIG domains
  for (const b of Object.values(brands)) {
    if (Array.isArray(b.domains) && b.domains.some(rule => domainMatches(d, rule))) return b;
  }
  // 2) Try BRAND_DOMAIN_MAP
  const hit = externalDomainMap.find(e => domainMatches(d, e.domain));
  if (hit && brands[hit.brandKey]) return brands[hit.brandKey];
  // 3) Fallback: local-part equals brand key
  const key = String(local || '').toUpperCase();
  return brands[key] || null;
}

module.exports = { brands, resolveBrandFromEmail, addBrandRuntime, getBrands, getBrandById };
