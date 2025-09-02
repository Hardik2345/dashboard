const { resolveBrandFromEmail } = require('../config/brands');
const { getBrandConnection } = require('../lib/brandConnectionManager');

async function brandContext(req, res, next) {
  if (!req.user || !req.user.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const brandCfg = resolveBrandFromEmail(req.user.email);
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
