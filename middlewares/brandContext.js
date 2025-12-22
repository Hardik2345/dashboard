const { resolveBrandFromEmail, getBrands } = require('../config/brands');
const { getBrandConnection } = require('../lib/brandConnectionManager');


async function authorizeBrandContext(req, res, next) {
  if (!req.user || !req.user.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let brandCfg = null;

  if (req.user.isAuthor) {
    const rawKey = (req.query?.brand_key || req.headers['x-brand-key'] || req.body?.brand_key || '').toString().trim().toUpperCase();
    if (!rawKey) {
      return res.status(400).json({ error: 'brand_key required for author' });
    }
    const map = getBrands();
    brandCfg = map[rawKey] || null;
    if (!brandCfg) {
      return res.status(404).json({ error: `Unknown brand_key ${rawKey}` });
    }
  } else {
    if (req.user.brandKey) {
      const map = getBrands();
      brandCfg = map[req.user.brandKey] || null;
    }
    if (!brandCfg) {
      brandCfg = resolveBrandFromEmail(req.user.email);
    }
    if (!brandCfg) {
      return res.status(403).json({ error: 'Unknown brand for user email' });
    }
  }
  
  req.brandKey = brandCfg.key;
  req.brandConfig = brandCfg; // Store config for lazy connection
  next();
}

async function brandContext(req, res, next) {
  authorizeBrandContext(req, res, async () => {
     // If authorization passed, connect to DB
     try {
       if (!req.brandConfig) return next(); // Should trigger auth error if logic was skipped, but strict following prev logic
       const conn = await getBrandConnection(req.brandConfig);
       req.brandDb = conn;
       next();
     } catch (e) {
        console.error(`[brand=${req.brandConfig?.key}] DB connection error`, e.message);
        return res.status(503).json({ error: 'Brand database unavailable' });
     }
  });
}

module.exports = { brandContext, authorizeBrandContext };
