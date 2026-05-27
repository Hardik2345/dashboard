const { z } = require("zod");

const datumInsightsResponseSchema = z.object({
  insights: z.array(
    z.object({
      title: z.string().min(1).max(120),
      summary: z.string().min(1).max(300),
      sentiment: z.enum(["positive", "negative", "neutral"]),
      related_kpi_keys: z.array(z.string()).min(1),
      confidence: z.enum(["high", "medium", "low"]),
    }),
  ),
});

const focusSummaryResponseSchema = z.object({
  focus_items: z.array(
    z.object({
        title: z.string().min(1).max(80),
        category: z.string().min(1).max(80),
        source_task_ids: z.array(z.string()).min(1),
        confidence: z.enum(["high", "medium", "low"]),
        icon: z.string().optional(),
        color: z.string().optional(),
      }),
  ),
});

function validateDatumInsights(payload, allowedKpiKeys, maxItems) {
  const parsed = datumInsightsResponseSchema.safeParse(payload);
  if (!parsed.success) return null;
  const allowed = new Set(allowedKpiKeys);
  const insights = parsed.data.insights
    .filter((item) => item.related_kpi_keys.every((key) => allowed.has(key)))
    .slice(0, maxItems)
    .map((item) => ({ ...item, source: "ai_assisted" }));
  return insights.length ? insights : null;
}

function validateFocusItems(payload, allowedTaskIds, maxItems) {
  const allowed = new Set(allowedTaskIds.map(String));
  const parsed = focusSummaryResponseSchema.safeParse(payload);
  if (!parsed.success) return null;
  const focusItems = parsed.data.focus_items
    .filter((item) => item.source_task_ids.every((id) => allowed.has(String(id))))
    .slice(0, maxItems)
    .map((item) => ({ ...item, source: "ai_assisted" }));
  return focusItems.length ? focusItems : null;
}

module.exports = { validateDatumInsights, validateFocusItems };
