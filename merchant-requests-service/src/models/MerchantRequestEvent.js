const mongoose = require("mongoose");

const merchantRequestEventSchema = new mongoose.Schema(
  {
    request_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MerchantRequest",
      required: true,
      index: true,
    },
    brand_key: { type: String, required: true, uppercase: true, index: true },
    type: { type: String, required: true, index: true },
    source: {
      type: String,
      enum: ["datum", "todoist", "system"],
      required: true,
    },
    actor: {
      user_id: { type: String, default: "" },
      email: { type: String, default: "" },
      name: { type: String, default: "" },
      role: { type: String, default: "" },
    },
    message: { type: String, default: "" },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    todoist_comment_id: { type: String, default: "", index: true },
    local_comment_id: { type: String, default: "", index: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model("MerchantRequestEvent", merchantRequestEventSchema);
