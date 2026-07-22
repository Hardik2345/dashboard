const { handleControllerError } = require('../../shared/middleware/handleControllerError');
const {
  normalizeMetricRequest,
} = require('./requestNormalizer');
const {
  isRangeOverDataRestrictionPeriod,
  buildLongRangeUnavailablePayload,
} = require('./longRangeGate');

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
        if (isRangeOverDataRestrictionPeriod(normalized.spec.start, normalized.spec.end)) {
          return res.json(
            buildLongRangeUnavailablePayload({
              range: { start: normalized.spec.start, end: normalized.spec.end },
            }),
          );
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

    dailyFunnel: async (req, res) => {
      try {
        const normalized = normalizeMetricRequest(req, { requireBoth: true });
        if (!normalized.ok) {
          return res.status(normalized.status).json(normalized.body);
        }
        if (!normalized.spec.conn) {
          return res.status(500).json({ error: 'Brand DB connection unavailable' });
        }
        return res.json(
          await metricsService.getDailyFunnel({
            ...normalized.spec,
            utmDate: req.query.utm_date ? String(req.query.utm_date) : normalized.spec.end,
          }),
        );
      } catch (e) {
        return handleControllerError(res, e, 'daily-funnel failed');
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
