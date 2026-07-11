const Service = require("../models/Service");

function normalizeEndpoint(endpoint, defaultIntervalSeconds) {
  return {
    path: String(endpoint.path || "").trim(),
    method: String(endpoint.method || "GET").trim().toUpperCase(),
    critical: Boolean(endpoint.critical),
    intervalSeconds: Number(endpoint.intervalSeconds || defaultIntervalSeconds),
    expectedStatus: Number(endpoint.expectedStatus || 200),
  };
}

function getEndpointKey(endpoint) {
  return `${endpoint.method} ${endpoint.path}`;
}

function validateRegistrationPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "invalid payload";
  }
  if (!payload.serviceName || !payload.baseUrl || !payload.healthEndpoint) {
    return "serviceName, baseUrl, and healthEndpoint are required";
  }
  if (!Array.isArray(payload.endpoints) || payload.endpoints.length === 0) {
    return "endpoints must be a non-empty array";
  }
  return null;
}

function normalizeDependencies(payload) {
  if (!Object.prototype.hasOwnProperty.call(payload, "dependencies")) {
    return { shouldUpdate: false, dependencies: undefined };
  }

  if (!Array.isArray(payload.dependencies)) {
    return { shouldUpdate: false, dependencies: undefined };
  }

  const cleaned = payload.dependencies
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);

  if (cleaned.length !== payload.dependencies.length) {
    return { shouldUpdate: false, dependencies: undefined };
  }

  return {
    shouldUpdate: true,
    dependencies: [...new Set(cleaned)],
  };
}

function createRegistryService({ logger, defaultEndpointIntervalSeconds }) {
  async function register(payload) {
    const validationError = validateRegistrationPayload(payload);
    if (validationError) {
      const error = new Error(validationError);
      error.statusCode = 400;
      throw error;
    }

    const normalizedEndpoints = payload.endpoints.map((endpoint) =>
      normalizeEndpoint(endpoint, defaultEndpointIntervalSeconds),
    );
    const normalizedDependencies = normalizeDependencies(payload);
    const now = new Date();

    const existing = await Service.findOne({ serviceName: payload.serviceName });
    if (!existing) {
      const nextDoc = {
        serviceName: payload.serviceName,
        baseUrl: payload.baseUrl,
        healthEndpoint: payload.healthEndpoint,
        status: "UNKNOWN",
        registeredAt: now,
        lastRegistrationAt: now,
        endpoints: normalizedEndpoints,
      };
      if (normalizedDependencies.shouldUpdate) {
        nextDoc.dependencies = normalizedDependencies.dependencies;
      }
      await Service.create(nextDoc);
      logger.info("service.registered", { serviceName: payload.serviceName });
      return { message: "Registered Successfully", changed: true };
    }

    const existingKeys = new Set(existing.endpoints.map(getEndpointKey));
    const newEndpoints = normalizedEndpoints.filter(
      (endpoint) => !existingKeys.has(getEndpointKey(endpoint)),
    );

    const baseChanged =
      existing.baseUrl !== payload.baseUrl
      || existing.healthEndpoint !== payload.healthEndpoint;

    existing.baseUrl = payload.baseUrl;
    existing.healthEndpoint = payload.healthEndpoint;
    existing.lastRegistrationAt = now;
    if (normalizedDependencies.shouldUpdate) {
      existing.dependencies = normalizedDependencies.dependencies;
    }

    if (newEndpoints.length > 0) {
      existing.endpoints.push(...newEndpoints);
      await existing.save();
      logger.info("service.updated", {
        serviceName: payload.serviceName,
        endpointsAdded: newEndpoints.length,
      });
      return { message: "Service Updated", changed: true };
    }

    if (baseChanged) {
      await existing.save();
      logger.info("service.metadata_refreshed", { serviceName: payload.serviceName });
      return { message: "Already Registered", changed: false };
    }

    await existing.save();
    return { message: "Already Registered", changed: false };
  }

  async function listServices() {
    return Service.find({}).lean();
  }

  return {
    register,
    listServices,
  };
}

module.exports = {
  createRegistryService,
  getEndpointKey,
  normalizeDependencies,
};
