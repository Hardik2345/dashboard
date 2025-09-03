// Load per-brand database configuration from environment.
// BRAND_LIST: comma-separated list of brand keys (e.g. PTS,MILA,BBB)
// For each BRAND in list expect env vars:
//   <BRAND)_DB_HOST, <BRAND>_DB_PORT (optional, default 3306), <BRAND>_DB_USER, <BRAND>_DB_PASS, <BRAND>_DB_NAME (optional; default BRAND)

const REQUIRED_SUFFIXES = ['DB_HOST','DB_USER','DB_PASS'];

function loadBrands() {
  const list = (process.env.BRAND_LIST || '').split(',').map(s => s.trim()).filter(Boolean);
  const map = {};
  for (const key of list) {
    const upper = key.toUpperCase();
    for (const suf of REQUIRED_SUFFIXES) {
      const varName = `${upper}_${suf}`;
      if (!process.env[varName]) {
        throw new Error(`Missing env var ${varName} for brand ${upper}`);
      }
    }
    map[upper] = {
      key: upper,
      dbHost: process.env[`${upper}_DB_HOST`],
      dbPort: Number(process.env[`${upper}_DB_PORT`] || 3306),
      dbUser: process.env[`${upper}_DB_USER`],
      dbPass: process.env[`${upper}_DB_PASS`],
      dbName: process.env[`${upper}_DB_NAME`] || upper,
    };
  }
  return map;
}

let brands = loadBrands();

function addBrandRuntime(cfg) {
  const upper = cfg.key.toUpperCase();
  if (brands[upper]) throw new Error(`Brand ${upper} already exists`);
  const brandCfg = {
    key: upper,
    dbHost: cfg.dbHost,
    dbPort: Number(cfg.dbPort || 3306),
    dbUser: cfg.dbUser,
    dbPass: cfg.dbPass,
    dbName: cfg.dbName || upper,
  };
  brands[upper] = brandCfg;
  return brandCfg;
}

function getBrands() { return { ...brands }; }

function resolveBrandFromEmail(email) {
  if (!email) return null;
  const prefix = email.split('@')[0];
  if (!prefix) return null;
  const key = prefix.toUpperCase();
  return brands[key] || null;
}

module.exports = { brands, resolveBrandFromEmail, addBrandRuntime, getBrands };
