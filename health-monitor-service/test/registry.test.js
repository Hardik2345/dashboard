const test = require("node:test");
const assert = require("node:assert/strict");

const { createRegistryService } = require("../src/services/registryService");

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
