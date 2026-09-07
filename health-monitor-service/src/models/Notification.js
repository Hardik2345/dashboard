const { mongoose } = require("../db/mongo");

const notificationSchema = new mongoose.Schema(
  {
    incidentId: { type: String, required: true, index: true },
    alertKey: { type: String, default: "", index: true },
    event: { type: String, default: "", index: true },
    recipients: { type: [String], default: [] },
    subject: { type: String, required: true },
    status: {
      type: String,
      enum: ["SENT", "FAILED", "SKIPPED"],
      required: true,
    },
    error: { type: String, default: "" },
    sentAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

module.exports = mongoose.models.HealthMonitorNotification
  || mongoose.model("HealthMonitorNotification", notificationSchema, "notifications");
