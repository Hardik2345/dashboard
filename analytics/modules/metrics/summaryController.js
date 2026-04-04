const { QueryTypes } = require('sequelize');
const { handleControllerError } = require('../../shared/middleware/handleControllerError');
const {
  normalizeMetricRequest,
} = require('./requestNormalizer');

function buildSummaryController({ metricsService }) {
  return {
    dashboardSummary: async (req, res) => {
      try {
        const normalized = normalizeMetricRequest(req, { defaultToToday: true });
        if (!normalized.ok) {
          return res.status(normalized.status).json(normalized.body);
        }
        const brandQuery = (
          req.query.brand ||
          req.query.brand_key ||
          req.brandKey ||
          ''
        ).toString().trim();
        if (!brandQuery) {
          return res.status(400).json({ error: 'Missing brand_key' });
        }
        if (!normalized.spec.conn) {
          throw new Error('Database connection missing (tenant router required)');
        }
        normalized.spec.brandKey = brandQuery;
        return res.json(await metricsService.getDashboardSummary(normalized.spec));
      } catch (e) {
        return handleControllerError(res, e, 'dashboard-summary failed');
      }
    },

    summaryFilterOptions: async (req, res) => {
      try {
        const normalized = normalizeMetricRequest(req, { defaultToToday: true });
        if (!normalized.ok) {
          return res.status(normalized.status).json(normalized.body);
        }
        if (!normalized.spec.conn) {
          throw new Error('Database connection missing (tenant router required)');
        }
        return res.json({
          filter_options: await metricsService.getSummaryFilterOptions({
            conn: normalized.spec.conn,
            start: normalized.spec.start,
            end: normalized.spec.end,
          }),
        });
      } catch (e) {
        return handleControllerError(res, e, 'summary-filter-options failed');
      }
    },

    diagnoseTotalOrders: (sequelize) => async (req, res) => {
      try {
        const start = req.query.start;
        const end = req.query.end;
        const [envInfo] = await sequelize.query(
          "SELECT DATABASE() AS db, @@hostname AS host, @@version AS version",
          { type: QueryTypes.SELECT },
        );
        const sqlTotal =
          "SELECT COALESCE(SUM(total_orders),0) AS total FROM overall_summary WHERE date >= ? AND date <= ?";
        const sqlDaily =
          "SELECT date, SUM(total_orders) AS total_orders FROM overall_summary WHERE date >= ? AND date <= ? GROUP BY date ORDER BY date";
        const [totalRow] = await sequelize.query(sqlTotal, {
          type: QueryTypes.SELECT,
          replacements: [start, end],
        });
        const daily = await sequelize.query(sqlDaily, {
          type: QueryTypes.SELECT,
          replacements: [start, end],
        });
        res.json({
          connecting_to: envInfo,
          range: { start, end },
          sql_total: sqlTotal,
          sql_params: [start, end],
          total_orders: Number(totalRow.total || 0),
          daily_breakdown: daily.map((r) => ({
            date: r.date,
            total_orders: Number(r.total_orders || 0),
          })),
        });
      } catch (e) {
        return handleControllerError(res, e, 'diagnose-total-orders failed');
      }
    },
  };
}

module.exports = { buildSummaryController };
