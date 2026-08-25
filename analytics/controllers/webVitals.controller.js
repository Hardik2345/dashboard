const { handleControllerError } = require("../shared/middleware/handleControllerError");
const webVitalsService = require("../services/webVitals.service");

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

const webVitalsController = {
  async snapshot(req, res) {
    try {
      const brandKey = req.query.brand_key;
      if (!brandKey) {
        return res.status(400).json({ error: "brand_key is required" });
      }
      const date = req.query.date ? String(req.query.date) : todayIsoDate();
      return res.json(await webVitalsService.getSnapshot({ brandKey, date }));
    } catch (error) {
      return handleControllerError(res, error, "web-vitals-snapshot failed");
    }
  },

  async trend(req, res) {
    try {
      const brandKey = req.query.brand_key;
      if (!brandKey) {
        return res.status(400).json({ error: "brand_key is required" });
      }
      const end = req.query.end ? String(req.query.end) : todayIsoDate();
      const start = req.query.start ? String(req.query.start) : end;
      const granularity = req.query.granularity === "hourly" ? "hourly" : "daily";
      return res.json(
        await webVitalsService.getTrend({ brandKey, start, end, granularity }),
      );
    } catch (error) {
      return handleControllerError(res, error, "web-vitals-trend failed");
    }
  },

  async allBrandsSnapshot(req, res) {
    try {
      const permissions = Array.isArray(req.user?.permissions) ? req.user.permissions : [];
      const canViewAllBrands = !!req.user?.isAuthor || permissions.includes("all");
      if (!canViewAllBrands) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const date = req.query.date ? String(req.query.date) : todayIsoDate();
      return res.json({
        date,
        brands: await webVitalsService.getAllBrandsSnapshot({ date }),
      });
    } catch (error) {
      return handleControllerError(res, error, "web-vitals-all-brands-snapshot failed");
    }
  },

  async pages(req, res) {
    try {
      const brandKey = req.query.brand_key;
      if (!brandKey) {
        return res.status(400).json({ error: "brand_key is required" });
      }
      const date = req.query.date ? String(req.query.date) : todayIsoDate();
      return res.json({
        date,
        rows: await webVitalsService.getPageBreakdown({ brandKey, date }),
      });
    } catch (error) {
      return handleControllerError(res, error, "web-vitals-pages failed");
    }
  },
};

module.exports = webVitalsController;
