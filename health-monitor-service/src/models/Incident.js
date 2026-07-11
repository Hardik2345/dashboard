const { mongoose } = require("../db/mongo");

const incidentSchema = new mongoose.Schema(
  {
    incidentId: { type: String, required: true, unique: true, index: true },
    service: { type: String, required: true, trim: true },
    endpoint: { type: String, required: true, trim: true },
    severity: {
      type: String,
      enum: ["CRITICAL", "WARNING"],
      required: true,
    },
    status: {
      type: String,
      enum: ["OPEN", "RESOLVED"],
      default: "OPEN",
      index: true,
    },
    startedAt: { type: Date, required: true },
    resolvedAt: { type: Date, default: null },
    duration: { type: Number, default: null },
    failureCount: { type: Number, default: 1, min: 1 },
    totalRetries: { type: Number, default: 0, min: 0 },
    evidenceCount: { type: Number, default: 0, min: 0 },
    dependencySummary: { type: mongoose.Schema.Types.Mixed, default: {} },
    lastProbeStatus: { type: mongoose.Schema.Types.Mixed, default: null },
    lastProbeMessage: { type: String, default: "" },
    lastFailure: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

incidentSchema.index({ service: 1, endpoint: 1, status: 1 });

module.exports = mongoose.models.HealthMonitorIncident
  || mongoose.model("HealthMonitorIncident", incidentSchema, "incidents");
