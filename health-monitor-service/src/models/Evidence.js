const { mongoose } = require("../db/mongo");

const evidenceSchema = new mongoose.Schema(
  {
    incidentId: { type: String, required: true, index: true },
    service: { type: String, required: true, trim: true },
    endpoint: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["api_response", "health_probe", "application_logs", "dependency_check"],
      required: true,
      index: true,
    },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    collectedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

module.exports = mongoose.models.HealthMonitorEvidence
  || mongoose.model("HealthMonitorEvidence", evidenceSchema, "evidences");
