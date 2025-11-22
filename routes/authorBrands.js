const express = require('express');
const { requireAuth } = require('../middlewares/auth');
const { addBrandRuntime, getBrands } = require('../config/brands');
const { getBrandConnection } = require('../lib/brandConnectionManager');
const { fetchEnvVars, upsertBrandsConfig, triggerDeploy } = require('../lib/renderClient');

const brandPersistLock = { locked: false };
async function withBrandLock(fn) {
  while (brandPersistLock.locked) { await new Promise(r => setTimeout(r, 50)); }
  brandPersistLock.locked = true;
  try { return await fn(); } finally { brandPersistLock.locked = false; }
}

function buildAuthorBrandsRouter(sequelize) {
  const router = express.Router();

  // List brands (author only)
  router.get('/brands', requireAuth, (req, res) => {
    if (!req.user?.isAuthor) return res.status(403).json({ error: 'Forbidden' });
    return res.json({ brands: Object.values(getBrands()).map(b => ({ key: b.key, host: b.dbHost, db: b.dbName })) });
  });

  // Create / persist brand (optional redeploy via Render)
  router.post('/brands', requireAuth, async (req, res) => {
    if (!req.user?.isAuthor) return res.status(403).json({ error: 'Forbidden' });
    const body = req.body || {};
    const errors = [];
    function reqStr(k){ if(!body[k]||typeof body[k]!== 'string'||!body[k].trim()) errors.push(k); }
    ['key','dbHost','dbUser','dbPass','dbName'].forEach(reqStr);
    if (body.key && !/^[A-Z0-9_]{2,20}$/i.test(body.key)) errors.push('key_format');
    const persist = !!body.persist;
    const dryRun = !!body.dryRun;
    if (errors.length) return res.status(400).json({ error: 'Invalid input', fields: errors });
    const upperKey = body.key.toUpperCase();
    let brandCfg;
    try {
      brandCfg = addBrandRuntime({
        key: upperKey,
        dbHost: body.dbHost.trim(),
        dbPort: body.dbPort || 3306,
        dbUser: body.dbUser.trim(),
        dbPass: body.dbPass,
        dbName: body.dbName.trim(),
      });
    } catch (e) { return res.status(400).json({ error: e.message }); }

    // Connection test early; if fails rollback runtime addition
    try {
      const conn = await getBrandConnection(brandCfg);
      await conn.sequelize.authenticate();
    } catch (e) {
      const current = require('../config/brands');
      if (current.brands && current.brands[upperKey]) delete current.brands[upperKey];
      return res.status(400).json({ error: 'Connection failed', detail: e.message });
    }

    if (!persist) {
      return res.status(201).json({ brand: { key: brandCfg.key }, persisted: false });
    }

    if (!process.env.RENDER_API_KEY || !process.env.SERVICE_ID) {
      return res.status(501).json({ error: 'Persistence unavailable', detail: 'Missing RENDER_API_KEY or SERVICE_ID' });
    }

    try {
      const result = await withBrandLock(async () => {
        let existing = [];
        try { existing = await fetchEnvVars(process.env.SERVICE_ID); } catch (e) {
          throw new Error('Failed to fetch env vars: ' + (e.message || 'unknown'));
        }
        const brandsVar = existing.find(v => v.key === 'BRANDS_CONFIG');
        let arr = [];
        if (brandsVar && brandsVar.value) {
          try { arr = JSON.parse(brandsVar.value); } catch (_) { /* ignore parse error; treat as empty */ }
        }
        if (arr.some(b => (b.key||'').toUpperCase() === upperKey)) {
          return { status: 'exists', deploy: null };
        }
        const newEntry = {
          key: upperKey,
          dbHost: brandCfg.dbHost,
          dbPort: brandCfg.dbPort,
          dbUser: brandCfg.dbUser,
          dbPass: brandCfg.dbPass,
          dbName: brandCfg.dbName,
        };
        const updated = [...arr, newEntry].sort((a,b) => a.key.localeCompare(b.key));
        if (dryRun) {
          const hash = require('crypto').createHash('sha256').update(JSON.stringify(updated)).digest('hex').slice(0,12);
          return { status: 'dry-run', hash };
        }
        try { await upsertBrandsConfig(process.env.SERVICE_ID, updated, existing); } catch (e) {
          throw new Error('Failed to upsert BRANDS_CONFIG: ' + (e.message || 'unknown'));
        }
        let deploy;
        try { deploy = await triggerDeploy(process.env.SERVICE_ID, `Add brand ${upperKey}`); } catch (e) {
          throw new Error('Env updated but deploy trigger failed: ' + (e.message || 'unknown'));
        }
        return { status: 'persisted', deploy };
      });
      if (result.status === 'exists') {
        return res.status(409).json({ error: 'Brand already persisted', brand: { key: upperKey } });
      }
      if (result.status === 'dry-run') {
        return res.status(200).json({ brand: { key: upperKey }, dryRun: true, envPreviewHash: result.hash });
      }
      return res.status(202).json({ brand: { key: upperKey }, persisted: true, deployId: result.deploy?.id });
    } catch (e) {
      console.error('[brand-persist] failure', e);
      return res.status(502).json({ error: 'Persistence failed', detail: e.message });
    }
  });

  return router;
}

module.exports = { buildAuthorBrandsRouter };
