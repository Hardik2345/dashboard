const { z } = require("zod");

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const RangeSchema = z.object({
  start: isoDate.optional(),
  end: isoDate.optional(),
});

const BucketSchema = z.object({
  brand_key: z.string().min(2).max(32).transform(s => s.toUpperCase()),
  lower_bound_sessions: z.number().int().nonnegative(),
  upper_bound_sessions: z.number().int().nonnegative(),
  offset_pct: z.number().min(-100).max(100),
  active: z.boolean().optional(),
  priority: z.number().int().min(0).max(10000).optional(),
  effective_from: isoDate.nullable().optional(),
  effective_to: isoDate.nullable().optional(),
  notes: z.string().max(255).optional().nullable()
}).refine(d => d.lower_bound_sessions <= d.upper_bound_sessions, { message: 'lower_bound_sessions must be <= upper_bound_sessions' });

module.exports = {
  isoDate,
  RangeSchema,
  BucketSchema,
};
