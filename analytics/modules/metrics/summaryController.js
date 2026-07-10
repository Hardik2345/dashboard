const { QueryTypes } = require('sequelize');
const { handleControllerError } = require('../../shared/middleware/handleControllerError');
const {
  normalizeMetricRequest,
} = require('./requestNormalizer');

function getPreviousDateWindow(start, end) {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const dayCount = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
  const prevEnd = new Date(startDate);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - dayCount + 1);
  return {
    prevStart: prevStart.toISOString().slice(0, 10),
    prevEnd: prevEnd.toISOString().slice(0, 10),
  };
}

async function fetchDailyPerformanceAverages(conn, start, end) {
  const rows = await conn.query(
    `
      SELECT date, AVG(avg_performance) AS avg_performance
      FROM daily_web_vitals_summary
      WHERE date >= ? AND date <= ?
      GROUP BY date
      ORDER BY date ASC
    `,
    {
      type: QueryTypes.SELECT,
      replacements: [start, end],
    },
  );

  return rows.map((row) => ({
    date: row.date,
    avg_performance: Number(row.avg_performance),
  }));
}

function calculatePeriodAverage(rows) {
  if (!rows.length) return null;
  return rows.reduce((sum, row) => sum + Number(row.avg_performance || 0), 0) / rows.length;
}

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
            timezone: normalized.spec.timezone,
          }),
        });
      } catch (e) {
        return handleControllerError(res, e, 'summary-filter-options failed');
      }
    },

    dashboardSummaryBrands: async (req, res) => {
      try {
        const normalized = normalizeMetricRequest(req, { defaultToToday: true });
        if (!normalized.ok) {
          return res.status(normalized.status).json(normalized.body);
        }
        const snapshot = await metricsService.getOverallSnapshot({
          user: req.user || {},
          spec: normalized.spec,
        });
        return res.json(snapshot);
      } catch (e) {
        return handleControllerError(res, e, "dashboard-summary-brands failed");
      }
    },

    webPerformanceSummary: async (req, res) => {
      try {
        const normalized = normalizeMetricRequest(req, {
          defaultToToday: false,
          requireBoth: true,
        });
        if (!normalized.ok) {
          return res.status(normalized.status).json(normalized.body);
        }
        if (!normalized.spec.conn) {
          throw new Error('Database connection missing (tenant router required)');
        }

        const { start, end, conn } = normalized.spec;
        const { prevStart, prevEnd } = getPreviousDateWindow(start, end);

        const [dailyAverages, previousDailyAverages] = await Promise.all([
          fetchDailyPerformanceAverages(conn, start, end),
          fetchDailyPerformanceAverages(conn, prevStart, prevEnd),
        ]);

        const currentAvg = calculatePeriodAverage(dailyAverages);
        const previousAvg = calculatePeriodAverage(previousDailyAverages);
        const changePercent =
          previousAvg && currentAvg != null
            ? ((currentAvg - previousAvg) / previousAvg) * 100
            : null;

        return res.json({
          daily_averages: dailyAverages,
          current_avg: currentAvg,
          previous_avg: previousAvg,
          change_percent: changePercent,
        });
      } catch (e) {
        return handleControllerError(res, e, 'web-performance-summary failed');
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
