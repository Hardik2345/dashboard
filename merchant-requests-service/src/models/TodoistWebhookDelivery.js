const mongoose = require("mongoose");

const todoistWebhookDeliverySchema = new mongoose.Schema(
  {
    delivery_id: { type: String, required: true, unique: true, index: true },
    event_name: { type: String, default: "" },
    processed: { type: Boolean, default: false },
    error: { type: String, default: "" },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

module.exports = mongoose.model("TodoistWebhookDelivery", todoistWebhookDeliverySchema);
