const mongoose = require("mongoose");

const reportRunSchema = new mongoose.Schema(
  {
    tenant_id: { type: String, required: true, index: true },
    report_definition_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReportDefinition",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "queued",
        "generating",
        "pending_approval",
        "approved",
        "dispatching",
        "sent",
        "rejected",
        "expired",
        "failed",
      ],
      default: "queued",
      index: true,
    },
    period: {
      start_at: { type: Date, required: true },
      end_at: { type: Date, required: true },
      label: { type: String, required: true },
      timezone: { type: String, default: "Asia/Kolkata" },
      comparison_start_at: { type: Date, default: null },
      comparison_end_at: { type: Date, default: null },
    },
    snapshot: {
      kpis: { type: Array, default: [] },
      datum_insights: { type: Array, default: [] },
      focus_items: { type: Array, default: [] },
      html: { type: String, default: "" },
      html_url: { type: String, default: null },
      pdf_url: { type: String, default: null },
    },
    ai_metadata: {
      provider: { type: String, default: null },
      model: { type: String, default: null },
      datum_prompt_version: { type: String, default: null },
      focus_prompt_version: { type: String, default: null },
      input_hash: { type: String, default: null },
      output_hash: { type: String, default: null },
      fallback_used: { type: Boolean, default: false },
    },
    approval: {
      required: { type: Boolean, default: true },
      status: {
        type: String,
        enum: ["pending", "approved", "rejected", "expired", "skipped"],
        default: "pending",
      },
      token_hash: { type: String, default: null, index: true },
      expires_at: { type: Date, default: null },
      requested_at: { type: Date, default: null },
      decided_at: { type: Date, default: null },
      decided_by: { type: String, default: null },
      rejection_reason: { type: String, default: null },
    },
    dispatch: {
      provider: { type: String, default: "smtp" },
      message_id: { type: String, default: null },
      sent_at: { type: Date, default: null },
      recipients_count: { type: Number, default: 0 },
      attempts: { type: Number, default: 0 },
    },
    error: {
      code: { type: String, default: null },
      message: { type: String, default: null },
      details: { type: mongoose.Schema.Types.Mixed, default: null },
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

reportRunSchema.index({ tenant_id: 1, created_at: -1 });
reportRunSchema.index(
  { report_definition_id: 1, "period.start_at": 1, "period.end_at": 1 },
  { unique: true },
);
reportRunSchema.index({ status: 1, created_at: 1 });

module.exports = mongoose.model("ReportRun", reportRunSchema);
