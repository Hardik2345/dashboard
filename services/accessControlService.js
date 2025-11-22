const { QueryTypes } = require('sequelize');

function createAccessControlService(sequelize) {
  const accessCache = { data: null, fetchedAt: 0 };

  async function ensureAccessControlTables() {
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS access_control_settings (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT,
          mode ENUM('domain','whitelist') NOT NULL DEFAULT 'domain',
          auto_provision_brand_user TINYINT(1) NOT NULL DEFAULT 0,
          updated_by BIGINT NULL,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS access_whitelist_emails (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          email VARCHAR(255) NOT NULL,
          brand_key VARCHAR(32) NULL,
          notes VARCHAR(255) NULL,
          added_by BIGINT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      const [rows] = await sequelize.query('SELECT id FROM access_control_settings LIMIT 1');
      if (!rows || rows.length === 0) {
        await sequelize.query("INSERT INTO access_control_settings (mode, auto_provision_brand_user) VALUES ('domain', 0)");
      }
    } catch (e) {
      console.error('[access-control] ensure tables failed', e);
    }
  }

  async function getAccessSettings(force = false) {
    try {
      const TTL = 60_000;
      const now = Date.now();
      if (!force && accessCache.data && (now - accessCache.fetchedAt < TTL)) return accessCache.data;
      const [rows] = await sequelize.query('SELECT mode, auto_provision_brand_user FROM access_control_settings LIMIT 1');
      const mode = rows?.[0]?.mode || 'domain';
      const autoProvision = rows?.[0]?.auto_provision_brand_user ? true : false;
      const [wl] = await sequelize.query('SELECT COUNT(1) AS cnt FROM access_whitelist_emails');
      const whitelistCount = Number(wl?.[0]?.cnt || 0);
      accessCache.data = { mode, autoProvision, whitelistCount };
      accessCache.fetchedAt = now;
      return accessCache.data;
    } catch (e) {
      return { mode: 'domain', autoProvision: false, whitelistCount: 0 };
    }
  }

  function bustAccessCache() { accessCache.data = null; accessCache.fetchedAt = 0; }

  return {
    ensureAccessControlTables,
    getAccessSettings,
    bustAccessCache,
    accessCache,
  };
}

module.exports = { createAccessControlService };
