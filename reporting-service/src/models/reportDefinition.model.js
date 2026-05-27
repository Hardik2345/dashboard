const mongoose = require("mongoose");

const reportDefinitionSchema = new mongoose.Schema(
  {
    tenant_id: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["active", "paused", "archived"],
      default: "active",
      index: true,
    },
    report_type: { type: String, enum: ["digest"], default: "digest" },
    template_key: { type: String, default: "weekly_digest_v1" },
    period: {
      type: {
        type: String,
        enum: ["week", "month", "quarter", "custom"],
        default: "week",
      },
      timezone: { type: String, default: "Asia/Kolkata" },
      week_starts_on: { type: String, enum: ["monday"], default: "monday" },
      custom_days: { type: Number, default: null },
    },
    schedule: {
      enabled: { type: Boolean, default: true },
      cron: { type: String, default: "0 9 * * MON" },
      timezone: { type: String, default: "Asia/Kolkata" },
      next_run_at: { type: Date, default: null, index: true },
      last_run_at: { type: Date, default: null },
    },
    kpis: [
      {
        key: { type: String, required: true },
        label: { type: String, required: true },
        enabled: { type: Boolean, default: true },
        order: { type: Number, default: 0 },
        format: { type: String, default: "number" },
        comparison: { type: String, enum: ["previous_period"], default: "previous_period" },
        visualization: { type: String, enum: ["card"], default: "card" },
      },
    ],
    sections: {
      datum_insights: {
        enabled: { type: Boolean, default: true },
        mode: { type: String, enum: ["deterministic", "ai_assisted"], default: "deterministic" },
        max_items: { type: Number, default: 3 },
      },
      focus_summary: {
        enabled: { type: Boolean, default: true },
        mode: { type: String, enum: ["deterministic", "ai_assisted"], default: "deterministic" },
        max_items: { type: Number, default: 5 },
      },
    },
    ai: {
      enabled: { type: Boolean, default: false },
      provider: { type: String, default: "openai" },
      model: { type: String, default: null },
      fallback_on_error: { type: Boolean, default: true },
      datum_prompt_version: { type: String, default: "datum_insights_v1" },
      focus_prompt_version: { type: String, default: "focus_summary_v1" },
    },
    approval: {
      required: { type: Boolean, default: true },
      approver_user_ids: [{ type: String }],
      approver_emails: [{ type: String }],
      expires_after_hours: { type: Number, default: 72 },
    },
    recipients: {
      to: [{ type: String }],
      cc: [{ type: String }],
      bcc: [{ type: String }],
      tenant_default_contacts: { type: Boolean, default: true },
    },
    created_by: { type: String, default: null },
    updated_by: { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

reportDefinitionSchema.index({ tenant_id: 1, status: 1 });
reportDefinitionSchema.index({ "schedule.next_run_at": 1, status: 1 });

module.exports = mongoose.model("ReportDefinition", reportDefinitionSchema);
