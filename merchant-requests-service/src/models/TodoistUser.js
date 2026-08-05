const mongoose = require("mongoose");

const todoistUserSchema = new mongoose.Schema(
  {
    todoist_user_id: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    active: { type: Boolean, default: true },
    raw: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model("TodoistUser", todoistUserSchema);
