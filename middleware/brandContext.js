const { resolveBrandFromEmail, getBrands } = require('../config/brands');
const { getBrandConnection } = require('../lib/brandConnectionManager');

async function brandContext(req, res, next) {
  if (!req.user || !req.user.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.user.isAuthor) {
    // Author has no brand context; block brand-protected routes explicitly.
    return res.status(400).json({ error: 'Brand context not available for author user' });
  }
  // Prefer brandKey set at login time (e.g., via Google SSO)
  let brandCfg = null;
  if (req.user.brandKey) {
    const map = getBrands();
    brandCfg = map[req.user.brandKey];
  }
  if (!brandCfg) {
    brandCfg = resolveBrandFromEmail(req.user.email);
  }
  if (!brandCfg) {
    return res.status(403).json({ error: 'Unknown brand for user email' });
  }
  try {
    const conn = await getBrandConnection(brandCfg);
    req.brandKey = brandCfg.key;
    req.brandDb = conn;
    next();
  } catch (e) {
    console.error(`[brand=${brandCfg.key}] DB connection error`, e.message);
    return res.status(503).json({ error: 'Brand database unavailable' });
  }
}

module.exports = { brandContext };
