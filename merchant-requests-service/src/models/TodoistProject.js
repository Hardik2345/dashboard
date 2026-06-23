const mongoose = require("mongoose");

const todoistProjectSchema = new mongoose.Schema(
  {
    todoist_project_id: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: "" },
    parent_id: { type: String, default: "" },
    color: { type: String, default: "" },
    is_archived: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    // Last time this project was seen in a full pull; used to retire stale rows.
    synced_at: { type: Date, default: Date.now },
    raw: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model("TodoistProject", todoistProjectSchema);
