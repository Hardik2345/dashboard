const express = require("express");
const { requirePermission } = require("../../shared/middleware/identityEdge");
const { brandContext } = require("../../shared/middleware/brandContext");
const { buildBundlesController } = require("./controller");

function buildBundlesRouter() {
  const router = express.Router();
  const controller = buildBundlesController();

  router.get("/bundles/options", requirePermission("bundles_panel"), brandContext, controller.options);
  router.get("/bundles/summary", requirePermission("bundles_panel"), brandContext, controller.summary);
  router.get("/bundles/summary/export", requirePermission("bundles_panel"), brandContext, controller.summaryCsv);
  router.get("/bundles/products", requirePermission("bundles_panel"), brandContext, controller.products);
  router.get("/bundles/products/export", requirePermission("bundles_panel"), brandContext, controller.productsCsv);

  return router;
}

module.exports = { buildBundlesRouter };
