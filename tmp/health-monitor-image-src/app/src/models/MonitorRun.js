const { mongoose } = require("../db/mongo");

const monitorRunSchema = new mongoose.Schema(
  {
    service: { type: String, required: true, trim: true, index: true },
    endpoint: { type: String, required: true, trim: true },
    timestamp: { type: Date, required: true, default: Date.now, index: true },
    status: {
      type: String,
      enum: ["SUCCESS", "FAILURE"],
      required: true,
    },
    responseCode: { type: Number, default: null },
    latency: { type: Number, default: null },
    responseSummary: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = mongoose.models.HealthMonitorRun
  || mongoose.model("HealthMonitorRun", monitorRunSchema, "monitor_runs");
