const express = require("express");
const { requirePermission } = require("../shared/middleware/identityEdge");
const webVitalsController = require("../controllers/webVitals.controller");

function buildWebVitalsRouter() {
  const router = express.Router();

  router.use(requirePermission("web_vitals_panel"));

  router.get("/snapshot", webVitalsController.snapshot);
  router.get("/all-brands-snapshot", webVitalsController.allBrandsSnapshot);
  router.get("/trend", webVitalsController.trend);
  router.get("/pages", webVitalsController.pages);

  return router;
}

module.exports = {
  buildWebVitalsRouter,
};
