const { computeBucketStart, formatDateTimeUTC, hashIp } = require('../utils/sessionUtils');

function createSessionActivityService(sequelize, { sessionBucketMs = 10 * 60 * 1000, sessionTrackingEnabled }) {
  async function ensureSessionActivityTable() {
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS session_activity (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          brand_key VARCHAR(32) NOT NULL,
          user_email VARCHAR(255) NOT NULL,
          bucket_start DATETIME NOT NULL,
          hit_count INT UNSIGNED NOT NULL DEFAULT 1,
          first_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          user_agent VARCHAR(255) NULL,
          ip_hash CHAR(64) NULL,
          meta_json JSON NULL,
          PRIMARY KEY (id),
          UNIQUE KEY uq_brand_user_bucket (brand_key, user_email, bucket_start),
          KEY idx_brand_bucket (brand_key, bucket_start),
          KEY idx_brand_last_seen (brand_key, last_seen)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    } catch (e) {
      console.error('[session-activity] ensure table failed', e);
    }
  }

  async function recordSessionActivity({ brandKey, email, userAgent, ip, meta }) {
    if (!sessionTrackingEnabled) return;
    const brand = (brandKey || '').toString().trim().toUpperCase();
    const mail = (email || '').toString().trim().toLowerCase();
    if (!brand || !mail) return;

    const bucketStart = formatDateTimeUTC(computeBucketStart(Date.now(), sessionBucketMs));
    if (!bucketStart) return;

    const ipHash = hashIp(ip);
    const ua = userAgent ? userAgent.toString().slice(0, 255) : null;
    let metaJson = null;
    if (meta && typeof meta === 'object') {
      try { metaJson = JSON.stringify(meta); }
      catch { metaJson = null; }
    }

    try {
      await sequelize.query(`
        INSERT INTO session_activity (brand_key, user_email, bucket_start, hit_count, first_seen, last_seen, user_agent, ip_hash, meta_json)
        VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          hit_count = hit_count + 1,
          last_seen = VALUES(last_seen),
          user_agent = COALESCE(VALUES(user_agent), user_agent),
          ip_hash = COALESCE(VALUES(ip_hash), ip_hash),
          meta_json = COALESCE(VALUES(meta_json), meta_json)
      `, {
        replacements: [brand, mail, bucketStart, ua, ipHash, metaJson],
      });
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[session-activity] failed to record', err?.message || err);
      }
    }
  }

  return {
    ensureSessionActivityTable,
    recordSessionActivity,
  };
}

module.exports = { createSessionActivityService };
