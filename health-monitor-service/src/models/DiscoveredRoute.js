const { mongoose } = require("../db/mongo");

const discoveredRouteSchema = new mongoose.Schema(
  {
    serviceName: { type: String, required: true, trim: true, index: true },
    baseUrl: { type: String, required: true, trim: true },
    method: { type: String, required: true, uppercase: true, trim: true },
    path: { type: String, required: true, trim: true },
    routeType: {
      type: String,
      enum: ["health", "probe", "read", "mutating", "auth", "internal_only"],
      default: "read",
    },
    hasPathParams: { type: Boolean, default: false },
    sourceModule: { type: String, default: "", trim: true },
    controllerHint: { type: String, default: "", trim: true },
    middlewareNames: { type: [String], default: [] },
    authRequired: { type: Boolean, default: false },
    authInference: {
      type: String,
      enum: ["inferred", "unknown"],
      default: "unknown",
    },
    monitoringRecommendation: {
      type: String,
      enum: ["direct_health_candidate", "probe_only", "manual_review"],
      default: "manual_review",
    },
    successHint: { type: String, default: "", trim: true },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

discoveredRouteSchema.index({ serviceName: 1, method: 1, path: 1 }, { unique: true });

module.exports = mongoose.models.HealthMonitorDiscoveredRoute
  || mongoose.model("HealthMonitorDiscoveredRoute", discoveredRouteSchema, "discovered_routes");
