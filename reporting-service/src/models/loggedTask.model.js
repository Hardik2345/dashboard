const mongoose = require("mongoose");

const loggedTaskSchema = new mongoose.Schema(
  {
    tenant_id: { type: String, required: true, index: true },
    category_id: { type: mongoose.Schema.Types.ObjectId, ref: "TaskCategory", default: null },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    impact_level: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    tags: [{ type: String }],
    task_date: { type: Date, required: true, index: true },
    author_id: { type: String, default: null },
    author_name: { type: String, default: "" },
    source: { type: String, enum: ["manual", "import"], default: "manual" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

loggedTaskSchema.index({ tenant_id: 1, task_date: -1 });
loggedTaskSchema.index({ tenant_id: 1, category_id: 1, task_date: -1 });

module.exports = mongoose.model("LoggedTask", loggedTaskSchema);
