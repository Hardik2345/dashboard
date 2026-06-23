const mongoose = require("mongoose");

const BrandTodoistConfigSchema = new mongoose.Schema(
  {
    brand_key: { type: String, required: true, uppercase: true, unique: true },
    todoist_project_id: { type: String, default: "" },
    // Maps each internal status to the Todoist section ID within this brand's project
    section_by_status: { type: Object, default: {} },
    provisioning_status: {
      type: String,
      enum: ["pending", "ready", "failed"],
      default: "pending",
    },
    provisioning_mode: {
      type: String,
      enum: ["auto", "manual"],
      default: "auto",
    },
    provisioning_error: { type: String, default: "" },
    // Internal statuses unlocked for merchant visibility beyond the defaults
    unlocked_statuses: { type: [String], default: [] },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

BrandTodoistConfigSchema.index({ todoist_project_id: 1 }, { sparse: true });

module.exports = mongoose.model("BrandTodoistConfig", BrandTodoistConfigSchema);
