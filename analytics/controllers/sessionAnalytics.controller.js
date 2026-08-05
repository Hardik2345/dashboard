const { handleControllerError } = require("../shared/middleware/handleControllerError");
const sessionAnalyticsService = require("../services/sessionAnalytics.service");

const sessionAnalyticsController = {
  async summary(req, res) {
    try {
      return res.json(
        await sessionAnalyticsService.getSummary({
          user: req.sessionAnalyticsUser || req.user,
          query: req.query,
        }),
      );
    } catch (error) {
      return handleControllerError(res, error, "session-analytics-summary failed");
    }
  },

  async trend(req, res) {
    try {
      return res.json(
        await sessionAnalyticsService.getTrend({
          user: req.sessionAnalyticsUser || req.user,
          query: req.query,
        }),
      );
    } catch (error) {
      return handleControllerError(res, error, "session-analytics-trend failed");
    }
  },

  async brands(req, res) {
    try {
      return res.json(
        await sessionAnalyticsService.getBrands({
          user: req.sessionAnalyticsUser || req.user,
          query: req.query,
        }),
      );
    } catch (error) {
      return handleControllerError(res, error, "session-analytics-brands failed");
    }
  },

  async users(req, res) {
    try {
      return res.json(
        await sessionAnalyticsService.getUsers({
          user: req.sessionAnalyticsUser || req.user,
          query: req.query,
        }),
      );
    } catch (error) {
      return handleControllerError(res, error, "session-analytics-users failed");
    }
  },

  async insights(req, res) {
    try {
      return res.json(
        await sessionAnalyticsService.getInsights({
          user: req.sessionAnalyticsUser || req.user,
          query: req.query,
        }),
      );
    } catch (error) {
      return handleControllerError(res, error, "session-analytics-insights failed");
    }
  },

  async filters(req, res) {
    try {
      return res.json(
        await sessionAnalyticsService.getFilters({
          user: req.sessionAnalyticsUser || req.user,
          query: req.query,
        }),
      );
    } catch (error) {
      return handleControllerError(res, error, "session-analytics-filters failed");
    }
  },

  async exportBrands(req, res) {
    try {
      const result = await sessionAnalyticsService.exportBrands({
        user: req.sessionAnalyticsUser || req.user,
        query: req.query,
      });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
      return res.send(result.csv);
    } catch (error) {
      return handleControllerError(res, error, "session-analytics-brands-export failed");
    }
  },

  async exportUsers(req, res) {
    try {
      const result = await sessionAnalyticsService.exportUsers({
        user: req.sessionAnalyticsUser || req.user,
        query: req.query,
      });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
      return res.send(result.csv);
    } catch (error) {
      return handleControllerError(res, error, "session-analytics-users-export failed");
    }
  },
};

module.exports = sessionAnalyticsController;
