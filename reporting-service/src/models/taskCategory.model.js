const mongoose = require("mongoose");

const taskCategorySchema = new mongoose.Schema(
  {
    tenant_id: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    color: { type: String, default: "#84cc16" },
    icon: { type: String, default: "cursor" },
    status: { type: String, enum: ["active", "archived"], default: "active" },
    created_by: { type: String, default: null },
    updated_by: { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

taskCategorySchema.index({ tenant_id: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("TaskCategory", taskCategorySchema);
