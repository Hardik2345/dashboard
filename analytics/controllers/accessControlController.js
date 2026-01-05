const { getBrands } = require('../config/brands');
const { requireBrandKey } = require('../utils/brandHelpers');

function listSettings(requireAuthor, getAccessSettings) {
  return [
    requireAuthor,
    async (req, res) => {
      try {
        const settings = await getAccessSettings(true);
        return res.json({ mode: settings.mode, autoProvision: settings.autoProvision, whitelistCount: settings.whitelistCount });
      } catch (e) { return res.status(500).json({ error: 'Failed' }); }
    }
  ];
}

function updateMode(requireAuthor, sequelize, bustAccessCache) {
  return [
    requireAuthor,
    async (req, res) => {
      try {
        const modeRaw = (req.body?.mode || '').toString();
        const mode = modeRaw === 'whitelist' ? 'whitelist' : 'domain';
        await sequelize.query('UPDATE access_control_settings SET mode = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP LIMIT 1', { replacements: [mode, req.user?.id || null] });
        bustAccessCache();
        return res.status(204).end();
      } catch (e) { return res.status(500).json({ error: 'Failed to update mode' }); }
    }
  ];
}

function updateSettings(requireAuthor, sequelize, bustAccessCache) {
  return [
    requireAuthor,
    async (req, res) => {
      try {
        const ap = String(req.body?.autoProvision ?? '').toLowerCase();
        const val = ap === '1' || ap === 'true';
        await sequelize.query('UPDATE access_control_settings SET auto_provision_brand_user = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP LIMIT 1', { replacements: [val ? 1 : 0, req.user?.id || null] });
        bustAccessCache();
        return res.status(204).end();
      } catch (e) { return res.status(500).json({ error: 'Failed to update settings' }); }
    }
  ];
}

function listWhitelist(requireAuthor, sequelize) {
  return [
    requireAuthor,
    async (req, res) => {
      try {
        const [rows] = await sequelize.query('SELECT id, email, brand_key, notes, added_by, created_at FROM access_whitelist_emails ORDER BY id DESC LIMIT 500');
        return res.json({ emails: rows || [] });
      } catch (e) { return res.status(500).json({ error: 'Failed to fetch whitelist' }); }
    }
  ];
}

function addWhitelist(requireAuthor, sequelize, bustAccessCache) {
  return [
    requireAuthor,
    async (req, res) => {
      try {
        const email = (req.body?.email || '').toString().trim().toLowerCase();
        const brandKey = (req.body?.brand_key || '').toString().trim().toUpperCase() || null;
        const notes = (req.body?.notes || '').toString().trim() || null;
        if (!/^.+@.+\..+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });
        if (brandKey) {
          const map = getBrands();
          if (!map[brandKey]) return res.status(400).json({ error: 'Unknown brand_key' });
        }
        try {
          await sequelize.query('INSERT INTO access_whitelist_emails (email, brand_key, notes, added_by) VALUES (?, ?, ?, ?)', { replacements: [email, brandKey, notes, req.user?.id || null] });
        } catch (e) {
          return res.status(409).json({ error: 'Email already whitelisted' });
        }
        bustAccessCache();
        return res.status(201).json({ email, brand_key: brandKey, notes });
      } catch (e) { return res.status(500).json({ error: 'Failed to add whitelist' }); }
    }
  ];
}

function deleteWhitelist(requireAuthor, sequelize, bustAccessCache) {
  return [
    requireAuthor,
    async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid id' });
        await sequelize.query('DELETE FROM access_whitelist_emails WHERE id = ? LIMIT 1', { replacements: [id] });
        bustAccessCache();
        return res.status(204).end();
      } catch (e) { return res.status(500).json({ error: 'Failed to remove' }); }
    }
  ];
}

module.exports = {
  listSettings,
  updateMode,
  updateSettings,
  listWhitelist,
  addWhitelist,
  deleteWhitelist,
  requireBrandKey,
};
