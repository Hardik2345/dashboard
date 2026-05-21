const { handleControllerError } = require("../../shared/middleware/handleControllerError");
const { buildBundlesService } = require("../../services/bundlesService");

function buildBundlesController() {
  const bundlesService = buildBundlesService();

  return {
    options: async (req, res) => {
      try {
        const normalized = bundlesService.normalizeBundleRequest(req.query);
        if (!normalized.ok) {
          return res.status(normalized.status).json(normalized.body);
        }

        const conn = req.brandDb?.sequelize;
        if (!conn) {
          return res.status(500).json({ error: "Brand DB connection unavailable" });
        }

        return res.json(
          await bundlesService.getBundleOptions({
            conn,
            ...normalized.spec,
          }),
        );
      } catch (e) {
        return handleControllerError(res, e, "bundles-options failed");
      }
    },

    summary: async (req, res) => {
      try {
        const normalized = bundlesService.normalizeBundleRequest(req.query);
        if (!normalized.ok) {
          return res.status(normalized.status).json(normalized.body);
        }

        const conn = req.brandDb?.sequelize;
        if (!conn) {
          return res.status(500).json({ error: "Brand DB connection unavailable" });
        }

        return res.json(
          await bundlesService.getBundleSummary({
            conn,
            ...normalized.spec,
          }),
        );
      } catch (e) {
        return handleControllerError(res, e, "bundles-summary failed");
      }
    },

    products: async (req, res) => {
      try {
        const normalized = bundlesService.normalizeBundleRequest(req.query, {
          requireBundleProductId: true,
        });
        if (!normalized.ok) {
          return res.status(normalized.status).json(normalized.body);
        }

        const conn = req.brandDb?.sequelize;
        if (!conn) {
          return res.status(500).json({ error: "Brand DB connection unavailable" });
        }

        return res.json(
          await bundlesService.getBundleProducts({
            conn,
            ...normalized.spec,
          }),
        );
      } catch (e) {
        return handleControllerError(res, e, "bundles-products failed");
      }
    },
  };
}

module.exports = { buildBundlesController };
