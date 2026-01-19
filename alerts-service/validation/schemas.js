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

const TIME_HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

function numberOrNull() {
  return z.preprocess((val) => {
    if (val === undefined) return undefined;
    if (val === null || val === '') return null;
    const num = typeof val === 'number' ? val : Number(val);
    return Number.isFinite(num) ? Number(num) : Number.NaN;
  }, z.union([z.number(), z.null()]));
}

function requiredNumber() {
  return z.preprocess((val) => {
    if (val === undefined || val === null || val === '') return Number.NaN;
    const num = typeof val === 'number' ? val : Number(val);
    return Number.isFinite(num) ? Number(num) : Number.NaN;
  }, z.number());
}

function intOrNull({ min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  return z.preprocess((val) => {
    if (val === undefined) return undefined;
    if (val === null || val === '') return null;
    const num = typeof val === 'number' ? val : Number(val);
    return Number.isFinite(num) ? Math.round(num) : Number.NaN;
  }, z.union([z.number().int().min(min).max(max), z.null()]));
}

const AlertSchema = z.object({
  name: z.preprocess((val) => {
    if (val === undefined) return undefined;
    if (val === null) return null;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      return trimmed.length ? trimmed : null;
    }
    return val;
  }, z.union([z.string().max(160), z.null()])).optional(),
  brand_key: z.string().min(2).max(32).transform((s) => s.toUpperCase()),
  metric_name: z.string().min(1).max(120),
  metric_type: z.enum(['base', 'derived']).default('base'),
  formula: z.preprocess((val) => {
    if (val === undefined) return undefined;
    if (val === null) return null;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      return trimmed.length ? trimmed : null;
    }
    return val;
  }, z.union([z.string().max(4000), z.null()])).optional(),
  threshold_type: z.enum(['absolute', 'percentage_drop', 'percentage_rise', 'less_than', 'more_than', 'greater_than']),
  threshold_value: requiredNumber(),
  critical_threshold: numberOrNull().optional(),
  severity: z.enum(['low', 'medium', 'high']).default('low'),
  cooldown_minutes: intOrNull({ min: 1, max: 10080 }).optional(),
  lookback_start: z.preprocess((val) => {
    if (val === undefined) return undefined;
    if (val === null || val === '') return null;
    return val;
  }, z.union([isoDate, z.null()])).optional(),
  lookback_end: z.preprocess((val) => {
    if (val === undefined) return undefined;
    if (val === null || val === '') return null;
    return val;
  }, z.union([isoDate, z.null()])).optional(),
  lookback_days: intOrNull({ min: 1, max: 730 }).optional(),
  quiet_hours_start: z.preprocess((val) => {
    if (val === undefined) return undefined;
    if (val === null || val === '') return null;
    return val;
  }, z.union([z.string().regex(TIME_HH_MM, 'Use HH:MM (24h)'), z.null()])).optional(),
  quiet_hours_end: z.preprocess((val) => {
    if (val === undefined) return undefined;
    if (val === null || val === '') return null;
    return val;
  }, z.union([z.string().regex(TIME_HH_MM, 'Use HH:MM (24h)'), z.null()])).optional(),
  have_recipients: z.preprocess((val) => {
    if (val === undefined) return undefined;
    if (val === null || val === '') return 0;
    return Number(val) ? 1 : 0;
  }, z.union([z.number().int().min(0).max(1), z.null()])).optional(),
  recipients: z.preprocess((val) => {
    if (val === undefined) return undefined;
    if (val === null || val === '') return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      return val
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
    return [];
  }, z.array(z.string().email()).max(25)).optional(),
  is_active: z.preprocess((val) => {
    if (val === undefined) return undefined;
    if (val === null) return null;
    if (typeof val === 'boolean') return val ? 1 : 0;
    if (typeof val === 'number') return val ? 1 : 0;
    if (typeof val === 'string') {
      const trimmed = val.trim().toLowerCase();
      if (!trimmed) return null;
      if (['1', 'true', 'yes', 'on'].includes(trimmed)) return 1;
      if (['0', 'false', 'no', 'off'].includes(trimmed)) return 0;
    }
    return val;
  }, z.union([z.number().int().min(0).max(1), z.null()])).optional(),
}).superRefine((data, ctx) => {
  if (data.metric_type === 'derived' && !data.formula) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Formula is required for derived metrics',
      path: ['formula'],
    });
  }
  if (data.lookback_start && data.lookback_end && data.lookback_start > data.lookback_end) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'lookback_start must be <= lookback_end',
      path: ['lookback_end'],
    });
  }
  if ((data.quiet_hours_start && !data.quiet_hours_end) || (!data.quiet_hours_start && data.quiet_hours_end)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Quiet hours require both start and end',
      path: ['quiet_hours_start'],
    });
  }
  if (data.threshold_type === 'less_than' && data.critical_threshold !== undefined && data.critical_threshold !== null) {
    if (data.critical_threshold >= data.threshold_value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Critical threshold must be less than warning threshold for "Less Than" condition',
        path: ['critical_threshold'],
      });
    }
  }
});

const AlertStatusSchema = z.object({
  brand_key: z.string().min(2).max(32).transform((s) => s.toUpperCase()).optional(),
  is_active: z.preprocess((val) => {
    if (val === undefined || val === null || val === '') return Number.NaN;
    if (typeof val === 'boolean') return val ? 1 : 0;
    const num = typeof val === 'number' ? val : Number(val);
    if (!Number.isFinite(num)) return Number.NaN;
    return num ? 1 : 0;
  }, z.number().int().min(0).max(1)),
});

module.exports = {
  isoDate,
  RangeSchema,
  BucketSchema,
  AlertSchema,
  AlertStatusSchema,
};
