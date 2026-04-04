const { handleControllerError } = require('../../shared/middleware/handleControllerError');
const {
  normalizeMetricRequest,
} = require('./requestNormalizer');

function buildTrendController({ metricsService }) {
  return {
    hourlyTrend: async (req, res) => {
      try {
        const normalized = normalizeMetricRequest(req, { requireBoth: true });
        if (!normalized.ok) {
          return res.status(normalized.status).json(normalized.body);
        }
        if (!normalized.spec.conn) {
          return res.status(500).json({ error: 'Brand DB connection unavailable' });
        }
        return res.json(await metricsService.getTrend(normalized.spec, 'hourly'));
      } catch (e) {
        return handleControllerError(res, e, 'hourly-trend failed');
      }
    },

    dailyTrend: async (req, res) => {
      try {
        const normalized = normalizeMetricRequest(req, { requireBoth: true });
        if (!normalized.ok) {
          return res.status(normalized.status).json(normalized.body);
        }
        if (!normalized.spec.conn) {
          return res.status(500).json({ error: 'Brand DB connection unavailable' });
        }
        return res.json(await metricsService.getTrend(normalized.spec, 'daily'));
      } catch (e) {
        return handleControllerError(res, e, 'daily-trend failed');
      }
    },

    monthlyTrend: async (req, res) => {
      try {
        const normalized = normalizeMetricRequest(req, { requireBoth: true });
        if (!normalized.ok) {
          return res.status(normalized.status).json(normalized.body);
        }
        if (!normalized.spec.conn) {
          return res.status(500).json({ error: 'Brand DB connection unavailable' });
        }
        return res.json(await metricsService.getTrend(normalized.spec, 'monthly'));
      } catch (e) {
        return handleControllerError(res, e, 'monthly-trend failed');
      }
    },
  };
}

module.exports = { buildTrendController };
