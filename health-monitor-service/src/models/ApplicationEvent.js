const { mongoose } = require("../db/mongo");

const applicationEventSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      enum: ["failure", "success"],
      required: true,
      index: true,
    },
    serviceName: { type: String, required: true, trim: true, index: true },
    baseUrl: { type: String, default: "", trim: true },
    method: { type: String, required: true, trim: true, uppercase: true },
    path: { type: String, required: true, trim: true },
    normalizedPath: { type: String, required: true, trim: true },
    endpoint: { type: String, required: true, trim: true, index: true },
    resolutionKey: { type: String, required: true, trim: true, index: true },
    fingerprint: { type: String, default: "", trim: true, index: true },
    statusCode: { type: Number, default: null },
    errorCode: { type: String, default: "", trim: true },
    errorType: { type: String, default: "", trim: true },
    message: { type: String, default: "", trim: true },
    responseBody: { type: mongoose.Schema.Types.Mixed, default: null },
    responseHeaders: { type: mongoose.Schema.Types.Mixed, default: {} },
    latency: { type: Number, default: null },
    requestContext: { type: mongoose.Schema.Types.Mixed, default: {} },
    correlationId: { type: String, default: "", trim: true },
    sourceTimestamp: { type: Date, required: true, index: true },
    thresholdBreached: { type: Boolean, default: false },
    incidentId: { type: String, default: "", trim: true, index: true },
  },
  { timestamps: true },
);

applicationEventSchema.index({ fingerprint: 1, sourceTimestamp: -1 });
applicationEventSchema.index({ resolutionKey: 1, eventType: 1, sourceTimestamp: -1 });

module.exports = mongoose.models.HealthMonitorApplicationEvent
  || mongoose.model("HealthMonitorApplicationEvent", applicationEventSchema, "application_events");
