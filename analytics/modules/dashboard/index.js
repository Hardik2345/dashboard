const express = require("express");
const { requirePermission } = require("../../shared/middleware/identityEdge");
const {
  buildDashboardLayoutService,
} = require("../../services/dashboardLayoutService");
const logger = require("../../shared/utils/logger");

function buildDashboardRouter(sequelize) {
  const router = express.Router();
  const service = buildDashboardLayoutService({
    model: sequelize.models.dashboard_layouts,
  });

  router.get(
    "/layout",
    requirePermission("dashboard_layout_customize"),
    async (req, res) => {
      try {
        const layout = await service.getLayoutForUser(req.user.id);
        return res.json(layout);
      } catch (error) {
        logger.error("[dashboard-layout] failed to load layout", {
          userId: req.user?.id,
          error: error?.message || String(error),
          stack: error?.stack,
        });
        return res.status(500).json({ error: "Failed to load dashboard layout" });
      }
    },
  );

  router.post(
    "/layout",
    requirePermission("dashboard_layout_customize"),
    async (req, res) => {
      try {
        const layout = await service.saveLayoutForUser(
          req.user.id,
          req.user,
          req.body || {},
        );
        return res.json(layout);
      } catch (error) {
        logger.error("[dashboard-layout] failed to save layout", {
          userId: req.user?.id,
          payload: req.body || {},
          error: error?.message || String(error),
          stack: error?.stack,
        });
        return res.status(500).json({ error: "Failed to save dashboard layout" });
      }
    },
  );

  return router;
}

module.exports = { buildDashboardRouter };
