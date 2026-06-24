const express = require("express");
const sessionAnalyticsController = require("../controllers/sessionAnalytics.controller");
const { checkSessionAnalyticsPermission } = require("../middlewares/checkSessionAnalyticsPermission");

function buildSessionAnalyticsRouter() {
  const router = express.Router();

  router.use(checkSessionAnalyticsPermission);

  router.get("/summary", sessionAnalyticsController.summary);
  router.get("/trend", sessionAnalyticsController.trend);
  router.get("/brands", sessionAnalyticsController.brands);
  router.get("/brands/export", sessionAnalyticsController.exportBrands);
  router.get("/users", sessionAnalyticsController.users);
  router.get("/users/export", sessionAnalyticsController.exportUsers);
  router.get("/insights", sessionAnalyticsController.insights);
  router.get("/filters", sessionAnalyticsController.filters);

  return router;
}

module.exports = {
  buildSessionAnalyticsRouter,
};
