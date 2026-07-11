const { mongoose } = require("../db/mongo");

const endpointSchema = new mongoose.Schema(
  {
    path: { type: String, required: true, trim: true },
    method: { type: String, required: true, uppercase: true, trim: true },
    critical: { type: Boolean, default: false },
    intervalSeconds: { type: Number, required: true, min: 1 },
    expectedStatus: { type: Number, default: 200, min: 100, max: 599 },
  },
  { _id: false },
);

const serviceSchema = new mongoose.Schema(
  {
    serviceName: { type: String, required: true, trim: true },
    baseUrl: { type: String, required: true, trim: true },
    healthEndpoint: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["HEALTHY", "DEGRADED", "UNREACHABLE", "UNKNOWN"],
      default: "UNKNOWN",
    },
    registeredAt: { type: Date, default: Date.now },
    lastRegistrationAt: { type: Date, default: Date.now },
    dependencies: { type: [String], default: undefined },
    endpoints: { type: [endpointSchema], default: [] },
  },
  { timestamps: true },
);

serviceSchema.index({ serviceName: 1 }, { unique: true });

module.exports = mongoose.models.HealthMonitorService
  || mongoose.model("HealthMonitorService", serviceSchema, "services");
