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

    summaryCsv: async (req, res) => {
      try {
        const normalized = bundlesService.normalizeBundleRequest(req.query);
        if (!normalized.ok) {
          return res.status(normalized.status).json(normalized.body);
        }

        const conn = req.brandDb?.sequelize;
        if (!conn) {
          return res.status(500).json({ error: "Brand DB connection unavailable" });
        }

        const exportResult = await bundlesService.getBundleSummaryCsv({
          conn,
          ...normalized.spec,
        });

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${exportResult.filename}"`);
        return res.send(exportResult.csv);
      } catch (e) {
        return handleControllerError(res, e, "bundles-summary-csv failed");
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

    productsCsv: async (req, res) => {
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

        const exportResult = await bundlesService.getBundleProductsCsv({
          conn,
          ...normalized.spec,
        });

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${exportResult.filename}"`);
        return res.send(exportResult.csv);
      } catch (e) {
        return handleControllerError(res, e, "bundles-products-csv failed");
      }
    },
  };
}

module.exports = { buildBundlesController };
