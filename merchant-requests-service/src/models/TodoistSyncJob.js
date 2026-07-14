const mongoose = require("mongoose");

const todoistSyncJobSchema = new mongoose.Schema(
  {
    request_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MerchantRequest",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["create_task", "update_assignment", "update_status", "update_due_date", "complete_task", "create_comment"],
      required: true,
      index: true,
    },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed", "cancelled"],
      default: "pending",
      index: true,
    },
    attempts: { type: Number, default: 0 },
    next_attempt_at: { type: Date, default: () => new Date(), index: true },
    // Set when a worker atomically claims the job (status → "running"); used to
    // reclaim jobs orphaned by a crash during processing.
    locked_at: { type: Date, default: null },
    last_error: { type: String, default: "" },
    completed_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

todoistSyncJobSchema.index({ status: 1, next_attempt_at: 1 });

module.exports = mongoose.model("TodoistSyncJob", todoistSyncJobSchema);
