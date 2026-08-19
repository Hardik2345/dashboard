const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createRegistryService,
  normalizeEndpoint,
  DEFAULT_SUCCESS_STATUS_FAMILY,
} = require("../src/services/registryService");

function buildLogger() {
  return {
    info() {},
    warn() {},
    error() {},
  };
}

test("registry service creates a new registration", async () => {
  const store = new Map();

  global.__hmServiceModel = {
    async findOne(query) {
      return store.get(query.serviceName) || null;
    },
    async create(doc) {
      store.set(doc.serviceName, {
        ...doc,
        save: async function save() {
          store.set(this.serviceName, this);
        },
      });
      return store.get(doc.serviceName);
    },
  };

  const Service = require("../src/models/Service");
  Service.findOne = global.__hmServiceModel.findOne;
  Service.create = global.__hmServiceModel.create;

  const service = createRegistryService({
    logger: buildLogger(),
    defaultEndpointIntervalSeconds: 300,
  });

  const result = await service.register({
    serviceName: "alerts-service",
    baseUrl: "http://alerts-service:5005",
    healthEndpoint: "/health",
    endpoints: [{ path: "/health", method: "GET", critical: true, intervalSeconds: 30 }],
  });

  assert.equal(result.message, "Registered Successfully");
  assert.equal(store.size, 1);
  assert.equal(store.get("alerts-service").endpoints[0].successStatusFamily, DEFAULT_SUCCESS_STATUS_FAMILY);
  assert.equal(store.get("alerts-service").endpoints[0].expectedStatus, undefined);
});

test("registry service appends only new endpoints", async () => {
  const saved = {
    serviceName: "alerts-service",
    baseUrl: "http://alerts-service:5005",
    healthEndpoint: "/health",
    endpoints: [{ path: "/health", method: "GET", critical: true, intervalSeconds: 30 }],
    async save() {
      return this;
    },
  };

  const Service = require("../src/models/Service");
  Service.findOne = async () => saved;

  const service = createRegistryService({
    logger: buildLogger(),
    defaultEndpointIntervalSeconds: 300,
  });

  const result = await service.register({
    serviceName: "alerts-service",
    baseUrl: "http://alerts-service:5005",
    healthEndpoint: "/health",
    endpoints: [
      { path: "/health", method: "GET", critical: true, intervalSeconds: 30 },
      { path: "/health/monitor", method: "GET", critical: true, intervalSeconds: 60 },
    ],
  });

  assert.equal(result.message, "Service Updated");
  assert.equal(saved.endpoints.length, 2);
});

test("registry service updates intervalSeconds on an existing endpoint when re-registered", async () => {
  const saved = {
    serviceName: "alerts-service",
    baseUrl: "http://alerts-service:5005",
    healthEndpoint: "/health",
    endpoints: [
      { path: "/health", method: "GET", critical: true, intervalSeconds: 30, successStatusFamily: DEFAULT_SUCCESS_STATUS_FAMILY },
      { path: "/health/monitor", method: "GET", critical: true, intervalSeconds: 60, successStatusFamily: DEFAULT_SUCCESS_STATUS_FAMILY },
    ],
    async save() {
      return this;
    },
  };

  const Service = require("../src/models/Service");
  Service.findOne = async () => saved;

  const service = createRegistryService({
    logger: buildLogger(),
    defaultEndpointIntervalSeconds: 300,
  });

  // Same endpoints (same method+path), but the interval changed from 30s/60s to hourly.
  const result = await service.register({
    serviceName: "alerts-service",
    baseUrl: "http://alerts-service:5005",
    healthEndpoint: "/health",
    endpoints: [
      { path: "/health", method: "GET", critical: true, intervalSeconds: 3600 },
      { path: "/health/monitor", method: "GET", critical: true, intervalSeconds: 3600 },
    ],
  });

  assert.equal(result.message, "Service Updated");
  assert.equal(result.changed, true);
  assert.equal(saved.endpoints.length, 2);
  assert.equal(saved.endpoints.find((e) => e.path === "/health").intervalSeconds, 3600);
  assert.equal(saved.endpoints.find((e) => e.path === "/health/monitor").intervalSeconds, 3600);
});

test("registry service reports no change when re-registered with identical endpoints", async () => {
  const saved = {
    serviceName: "alerts-service",
    baseUrl: "http://alerts-service:5005",
    healthEndpoint: "/health",
    endpoints: [
      { path: "/health", method: "GET", critical: true, intervalSeconds: 3600, successStatusFamily: DEFAULT_SUCCESS_STATUS_FAMILY },
    ],
    async save() {
      return this;
    },
  };

  const Service = require("../src/models/Service");
  Service.findOne = async () => saved;

  const service = createRegistryService({
    logger: buildLogger(),
    defaultEndpointIntervalSeconds: 300,
  });

  const result = await service.register({
    serviceName: "alerts-service",
    baseUrl: "http://alerts-service:5005",
    healthEndpoint: "/health",
    endpoints: [{ path: "/health", method: "GET", critical: true, intervalSeconds: 3600 }],
  });

  assert.equal(result.message, "Already Registered");
  assert.equal(result.changed, false);
});

test("registry service preserves dependencies when re-registration omits them", async () => {
  const saved = {
    serviceName: "analytics-service",
    baseUrl: "http://analytics-service:3006",
    healthEndpoint: "/health",
    dependencies: ["mongo", "mysql", "redis"],
    endpoints: [{ path: "/health", method: "GET", critical: true, intervalSeconds: 30 }],
    async save() {
      return this;
    },
  };

  const Service = require("../src/models/Service");
  Service.findOne = async () => saved;

  const service = createRegistryService({
    logger: buildLogger(),
    defaultEndpointIntervalSeconds: 300,
  });

  await service.register({
    serviceName: "analytics-service",
    baseUrl: "http://analytics-service:3006",
    healthEndpoint: "/health",
    endpoints: [{ path: "/health", method: "GET", critical: true, intervalSeconds: 30 }],
  });

  assert.deepEqual(saved.dependencies, ["mongo", "mysql", "redis"]);
});

test("normalizeEndpoint preserves explicit expectedStatus and success family fallback", () => {
  const exact = normalizeEndpoint(
    { path: "/sessions", method: "POST", intervalSeconds: 60, expectedStatus: 201 },
    300,
  );
  assert.equal(exact.expectedStatus, 201);
  assert.equal(exact.successStatusFamily, DEFAULT_SUCCESS_STATUS_FAMILY);

  const family = normalizeEndpoint(
    { path: "/health/monitor", method: "GET", intervalSeconds: 60, successStatusFamily: "2xx" },
    300,
  );
  assert.equal(family.expectedStatus, undefined);
  assert.equal(family.successStatusFamily, "2xx");

  const fallback = normalizeEndpoint(
    { path: "/health", method: "GET", intervalSeconds: 60 },
    300,
  );
  assert.equal(fallback.expectedStatus, undefined);
  assert.equal(fallback.successStatusFamily, DEFAULT_SUCCESS_STATUS_FAMILY);
});

test("registry service forwards discovered routes to the catalog service without affecting endpoint dedupe", async () => {
  const saved = {
    serviceName: "alerts-service",
    baseUrl: "http://alerts-service:5005",
    healthEndpoint: "/health",
    endpoints: [
      { path: "/health", method: "GET", critical: true, intervalSeconds: 30, successStatusFamily: DEFAULT_SUCCESS_STATUS_FAMILY },
    ],
    async save() {
      return this;
    },
  };

  const Service = require("../src/models/Service");
  Service.findOne = async () => saved;

  let catalogPayload = null;
  const service = createRegistryService({
    logger: buildLogger(),
    defaultEndpointIntervalSeconds: 300,
    routeCatalogService: {
      async upsertRoutes(payload) {
        catalogPayload = payload;
      },
    },
  });

  const result = await service.register({
    serviceName: "alerts-service",
    baseUrl: "http://alerts-service:5005",
    healthEndpoint: "/health",
    endpoints: [{ path: "/health", method: "GET", critical: true, intervalSeconds: 30 }],
    discoveredRoutes: [
      {
        path: "/alerts/:id",
        method: "GET",
        sourceModule: "routes/alerts.js",
      },
    ],
  });

  assert.equal(result.message, "Already Registered");
  assert.deepEqual(catalogPayload, {
    serviceName: "alerts-service",
    baseUrl: "http://alerts-service:5005",
    discoveredRoutes: [
      {
        path: "/alerts/:id",
        method: "GET",
        sourceModule: "routes/alerts.js",
      },
    ],
  });
  assert.equal(saved.endpoints.length, 1);
});
