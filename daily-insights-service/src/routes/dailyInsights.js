const express = require("express");
const { brandContext: defaultBrandContext } = require("../middleware/brandContext");
const { requirePermission, requireAuthor } = require("../middleware/auth");
const { getConfig } = require("../config");
const {
  DailyInsightQuerySchema,
  buildDailyInsightUpsertSchema,
  DailyInsightHistoryQuerySchema,
} = require("../validation/dailyInsight");
const dailyInsightsService = require("../services/dailyInsightsService");

function buildDailyInsightsRouter({
  brandContext = defaultBrandContext,
  config = getConfig(),
} = {}) {
  const router = express.Router();
  const DailyInsightUpsertSchema = buildDailyInsightUpsertSchema(config.insightCharLimit);

  // Viewing requires the daily_insight_view scope (authors always bypass via
  // requirePermission's isAuthor check).
  router.get("/", requirePermission("daily_insight_view"), brandContext, async (req, res) => {
    const parsed = DailyInsightQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const row = await dailyInsightsService.getInsight(req.brandDb, parsed.data.date);
      return res.json({ data: row });
    } catch (err) {
      console.error("[daily-insights] get failed", err);
      return res.status(500).json({ error: "internal_server_error" });
    }
  });

  // Creating/editing (and the history list used to pick a date to edit) is
  // strictly author/admin only — no permission scope can substitute for this.
  router.get("/history", requireAuthor, brandContext, async (req, res) => {
    const parsed = DailyInsightHistoryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const rows = await dailyInsightsService.listInsights(req.brandDb, parsed.data);
      return res.json({ data: rows });
    } catch (err) {
      console.error("[daily-insights] history failed", err);
      return res.status(500).json({ error: "internal_server_error" });
    }
  });

  router.post("/", requireAuthor, brandContext, async (req, res) => {
    const parsed = DailyInsightUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const row = await dailyInsightsService.upsertInsight(
        req.brandDb,
        parsed.data.date,
        parsed.data.insight,
      );
      return res.json({ data: row });
    } catch (err) {
      console.error("[daily-insights] save failed", err);
      return res.status(500).json({ error: "internal_server_error" });
    }
  });

  return router;
}

module.exports = { buildDailyInsightsRouter };
