const mongoose = require("mongoose");

const todoistSyncStateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    sync_token: { type: String, default: "*" },
    last_success_at: { type: Date, default: null },
    last_error: { type: String, default: "" },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model("TodoistSyncState", todoistSyncStateSchema);
