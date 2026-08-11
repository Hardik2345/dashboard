const { z } = require("zod");

// Same date regex convention as analytics/validation/schemas.js's isoDate.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const DailyInsightQuerySchema = z.object({
  date: isoDate,
});

function buildDailyInsightUpsertSchema(charLimit) {
  return z.object({
    date: isoDate,
    insight: z
      .string()
      .trim()
      .min(1, "Insight cannot be empty")
      .max(charLimit, `Insight must be ${charLimit} characters or fewer`),
  });
}

const DailyInsightHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  before: isoDate.optional(),
});

module.exports = {
  DailyInsightQuerySchema,
  buildDailyInsightUpsertSchema,
  DailyInsightHistoryQuerySchema,
};
