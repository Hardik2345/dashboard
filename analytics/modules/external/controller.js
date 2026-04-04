const { QueryTypes } = require('sequelize');
const { handleControllerError } = require('../../shared/middleware/handleControllerError');

function buildExternalController() {
  const lastUpdatedCache = { data: null, fetchedAt: 0 };

  function toIstPayload(dateObj, legacyRaw) {
    const istMs = dateObj.getTime() + (5.5 * 60 * 60 * 1000);
    const ist = new Date(istMs);
    const iso = ist.toISOString();
    const legacy = legacyRaw || iso.replace('T', ' ').replace('Z', '').slice(0, 19);
    return { iso, legacy };
  }

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
        { type: QueryTypes.SELECT },
      );

      const rawTs = rows?.[0]?.key_value ?? null;
      let iso = null;
      let legacy = null;

      if (rawTs instanceof Date) {
        const ist = toIstPayload(rawTs);
        iso = ist.iso;
        legacy = ist.legacy;
      } else if (typeof rawTs === 'string' && rawTs.trim()) {
        const looksLegacy = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(rawTs);
        const parsed = looksLegacy ? new Date(rawTs.replace(' ', 'T')) : new Date(rawTs);
        if (!isNaN(parsed.valueOf())) {
          const ist = toIstPayload(parsed, looksLegacy ? rawTs : null);
          iso = ist.iso;
          legacy = ist.legacy;
        }
      } else if (typeof rawTs === 'number') {
        const ms = rawTs > 1e12 ? rawTs : rawTs * 1000;
        const d = new Date(ms);
        if (!isNaN(d.valueOf())) {
          const ist = toIstPayload(d);
          iso = ist.iso;
          legacy = ist.legacy;
        }
      }

      const payload = {
        'Last successful run completed at': legacy,
        iso,
        timezone: 'IST',
      };

      cacheEntry.data = payload;
      cacheEntry.fetchedAt = now;

      res.set('Cache-Control', 'public, max-age=15');
      return res.json(payload);
    } catch (e) {
      return handleControllerError(res, e, 'Failed to read last updated');
    }
  }

  return { lastUpdated, lastUpdatedCache };
}

module.exports = { buildExternalController };
