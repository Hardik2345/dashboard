const mongoose = require("mongoose");

const reportEventSchema = new mongoose.Schema(
  {
    tenant_id: { type: String, required: true, index: true },
    report_run_id: { type: mongoose.Schema.Types.ObjectId, ref: "ReportRun", default: null, index: true },
    event_type: {
      type: String,
      enum: [
        "queued",
        "generated",
        "approval_requested",
        "approved",
        "rejected",
        "sent",
        "failed",
        "expired",
      ],
      required: true,
    },
    actor_type: { type: String, enum: ["system", "author"], default: "system" },
    actor_id: { type: String, default: null },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);

reportEventSchema.index({ tenant_id: 1, report_run_id: 1, created_at: 1 });

module.exports = mongoose.model("ReportEvent", reportEventSchema);
