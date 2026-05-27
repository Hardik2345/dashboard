const { z } = require("zod");

const email = z.string().email();
const periodSchema = z
  .object({
    type: z.enum(["week", "month", "quarter", "custom"]).default("week"),
    timezone: z.string().min(1).default("Asia/Kolkata"),
    week_starts_on: z.literal("monday").default("monday"),
    custom_days: z.number().int().min(1).max(366).nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.type === "custom" && !value.custom_days) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["custom_days"], message: "custom_days_required" });
    }
  });

const scheduleSchema = z.object({
  enabled: z.boolean().default(true),
  cron: z.string().min(1).default("0 9 * * MON"),
  timezone: z.string().min(1).default("Asia/Kolkata"),
  next_run_at: z.coerce.date().nullable().optional(),
  last_run_at: z.coerce.date().nullable().optional(),
});

const kpiSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  enabled: z.boolean().default(true),
  order: z.number().int().default(0),
  format: z.string().min(1).default("number"),
  comparison: z.literal("previous_period").default("previous_period"),
  visualization: z.literal("card").default("card"),
});

const sectionsSchema = z.object({
  datum_insights: z
    .object({
      enabled: z.boolean().default(true),
      mode: z.enum(["deterministic", "ai_assisted"]).default("deterministic"),
      max_items: z.number().int().min(1).max(10).default(3),
    })
    .default({}),
  focus_summary: z
    .object({
      enabled: z.boolean().default(true),
      mode: z.enum(["deterministic", "ai_assisted"]).default("deterministic"),
      max_items: z.number().int().min(1).max(10).default(5),
    })
    .default({}),
});

const aiSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.string().default("openai"),
  model: z.string().nullable().default(null),
  fallback_on_error: z.boolean().default(true),
  datum_prompt_version: z.string().default("datum_insights_v1"),
  focus_prompt_version: z.string().default("focus_summary_v1"),
});

const approvalSchema = z.object({
  required: z.boolean().default(true),
  approver_user_ids: z.array(z.string()).default([]),
  approver_emails: z.array(email).default([]),
  expires_after_hours: z.number().int().min(1).max(720).default(72),
});

const recipientsSchema = z.object({
  to: z.array(email).default([]),
  cc: z.array(email).default([]),
  bcc: z.array(email).default([]),
  tenant_default_contacts: z.boolean().default(true),
});

const definitionFields = {
  name: z.string().min(1),
  status: z.enum(["active", "paused", "archived"]).default("active"),
  report_type: z.literal("digest").default("digest"),
  template_key: z.string().default("weekly_digest_v1"),
  period: periodSchema.default({}),
  schedule: scheduleSchema.default({}),
  kpis: z.array(kpiSchema).default([]),
  sections: sectionsSchema.default({}),
  ai: aiSchema.default({}),
  approval: approvalSchema.default({}),
  recipients: recipientsSchema.default({}),
};

function validateDefinitionRules(value, ctx) {
    const hasKpi = value.kpis.some((kpi) => kpi.enabled);
    const hasSection = value.sections.datum_insights.enabled || value.sections.focus_summary.enabled;
    if (!hasKpi && !hasSection) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["kpis"], message: "enabled_kpi_or_section_required" });
    }
    if (value.approval.required && value.approval.approver_emails.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["approval", "approver_emails"], message: "approver_email_required" });
    }
}

const baseDefinitionSchema = z.object(definitionFields).superRefine(validateDefinitionRules);

const createDefinitionSchema = baseDefinitionSchema;
const updateDefinitionSchema = z.object({
  name: definitionFields.name.optional(),
  status: z.enum(["active", "paused", "archived"]).optional(),
  report_type: z.literal("digest").optional(),
  template_key: z.string().optional(),
  period: periodSchema.optional(),
  schedule: scheduleSchema.optional(),
  kpis: z.array(kpiSchema).optional(),
  sections: sectionsSchema.optional(),
  ai: aiSchema.optional(),
  approval: approvalSchema.optional(),
  recipients: recipientsSchema.optional(),
});

module.exports = { createDefinitionSchema, updateDefinitionSchema };
