const { QueryTypes } = require('sequelize');
const logger = require('../utils/logger');

function buildExternalController() {
  const lastUpdatedCache = { data: null, fetchedAt: 0 };

  async function lastUpdated(req, res) {
    try {
      if (!lastUpdatedCache[req.brandKey]) {
        lastUpdatedCache[req.brandKey] = { data: null, fetchedAt: 0 };
      }
      const cacheEntry = lastUpdatedCache[req.brandKey];
      const now = Date.now();
      if (cacheEntry.data && now - cacheEntry.fetchedAt < 30_000) {
        return res.json(cacheEntry.data);
      }

      const rows = await req.brandDb.sequelize.query(
        "SELECT key_value FROM pipeline_metadata WHERE key_name = 'last_pipeline_completion_time' LIMIT 1",
        { type: QueryTypes.SELECT }
      );

      const rawTs = rows?.[0]?.key_value ?? null;
      console.log("brand: ",req.brandKey,"brandDb: ",req.brandDb);
      console.log("rawTs: ",rawTs);

      let iso = null;
      let legacy = null;

      if (rawTs instanceof Date) {
        iso = rawTs.toISOString();
        legacy = iso.replace('T', ' ').replace('Z', '').slice(0, 19);
      } else if (typeof rawTs === 'string' && rawTs.trim()) {
        const looksLegacy = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(rawTs);
        const parsed = looksLegacy ? new Date(rawTs.replace(' ', 'T') + 'Z') : new Date(rawTs);
        if (!isNaN(parsed.valueOf())) {
          iso = parsed.toISOString();
          legacy = looksLegacy ? rawTs : iso.replace('T', ' ').replace('Z', '').slice(0, 19);
        } else {
          logger.warn('[last-updated] Unparseable timestamp string:', rawTs);
          legacy = rawTs;
        }
      } else if (typeof rawTs === 'number') {
        const ms = rawTs > 1e12 ? rawTs : rawTs * 1000;
        const d = new Date(ms);
        iso = d.toISOString();
        legacy = iso.replace('T', ' ').replace('Z', '').slice(0, 19);
      } else if (rawTs == null) {
        logger.warn('[last-updated] No row found in pipeline_metadata for last_pipeline_completion_time');
      } else {
        logger.warn('[last-updated] Unexpected key_value type:', typeof rawTs);
      }

      const payload = {
        "Last successful run completed at": legacy,
        iso,
        timezone: 'IST'
      };

      cacheEntry.data = payload;
      cacheEntry.fetchedAt = now;

      res.set('Cache-Control', 'public, max-age=15');
      return res.json(payload);
    } catch (e) {
      logger.error('Error fetching last updated from DB', e);
      const msg = process.env.NODE_ENV === 'production' ? 'Failed to read last updated' : (e?.message || 'Failed');
      return res.status(500).json({ error: msg });
    }
  }

  return { lastUpdated, lastUpdatedCache };
}

module.exports = { buildExternalController };
