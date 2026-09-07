const express = require("express");
const { requirePermission } = require("../shared/middleware/identityEdge");
const { brandContext } = require("../shared/middleware/brandContext");
const webVitalsController = require("../controllers/webVitals.controller");

function buildWebVitalsRouter() {
  const router = express.Router();

  router.use(requirePermission("web_vitals_panel"));

  router.get("/snapshot", brandContext, webVitalsController.snapshot);
  router.get("/all-brands-snapshot", webVitalsController.allBrandsSnapshot);
  router.get("/trend", brandContext, webVitalsController.trend);
  router.get("/pages", brandContext, webVitalsController.pages);

  return router;
}

module.exports = {
  buildWebVitalsRouter,
};
