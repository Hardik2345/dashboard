const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

const { connectMongo, disconnectMongo } = require("../src/db/mongo");
const Service = require("../src/models/Service");
const DiscoveredRoute = require("../src/models/DiscoveredRoute");
const { buildApp } = require("../src/app");
const { createRegistryService } = require("../src/services/registryService");
const { createRouteCatalogService } = require("../src/services/routeCatalogService");

let mongoServer;

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await connectMongo({
    mongoUri: mongoServer.getUri(),
    mongoDb: "health_monitor_test",
  });
});

test.after(async () => {
  await disconnectMongo();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

test.beforeEach(async () => {
  await Service.deleteMany({});
  await DiscoveredRoute.deleteMany({});
});

test("POST /register persists a new service in MongoDB", async () => {
  let rebuildCalled = false;
  const registryService = createRegistryService({
    logger: { info() {}, warn() {}, error() {} },
    defaultEndpointIntervalSeconds: 300,
    routeCatalogService: createRouteCatalogService({
      logger: { info() {}, warn() {}, error() {} },
    }),
  });

  const app = buildApp({
    logger: { info() {}, warn() {}, error() {} },
    registryService,
    schedulerService: {
      async rebuild() {
        rebuildCalled = true;
      },
    },
  });

  const response = await request(app)
    .post("/register")
    .send({
      serviceName: "analytics-service",
      baseUrl: "http://analytics-service:3006",
      healthEndpoint: "/health",
      dependencies: ["mongo", "mysql", "redis"],
      discoveredRoutes: [
        {
          path: "/metrics/summary",
          method: "GET",
          sourceModule: "modules/metrics/index.js",
          routeType: "read",
          middlewareNames: ["requireTrustedPrincipal"],
          hasPathParams: false,
          authRequired: true,
          authInference: "inferred",
          monitoringRecommendation: "probe_only",
          successHint: "2xx_candidate",
        },
      ],
      endpoints: [
        { path: "/health", method: "GET", critical: true, intervalSeconds: 30 },
        {
          path: "/health/monitor",
          method: "GET",
          critical: true,
          intervalSeconds: 60,
          successStatusFamily: "2xx",
        },
      ],
    });

  assert.equal(response.status, 200);
  assert.equal(response.text, "Registered Successfully");
  assert.equal(rebuildCalled, true);

  const saved = await Service.findOne({ serviceName: "analytics-service" }).lean();
  assert.equal(saved.baseUrl, "http://analytics-service:3006");
  assert.equal(saved.endpoints.length, 2);
  assert.deepEqual(saved.dependencies, ["mongo", "mysql", "redis"]);
  assert.equal(saved.endpoints[0].successStatusFamily, "2xx");
  assert.equal(saved.endpoints[0].expectedStatus, undefined);
  assert.equal(saved.endpoints[1].successStatusFamily, "2xx");
  const discovered = await DiscoveredRoute.findOne({
    serviceName: "analytics-service",
    method: "GET",
    path: "/metrics/summary",
  }).lean();
  assert.equal(discovered.sourceModule, "modules/metrics/index.js");
  assert.equal(discovered.monitoringRecommendation, "probe_only");
});

test("POST /register preserves explicit expectedStatus for exact-match endpoints", async () => {
  const registryService = createRegistryService({
    logger: { info() {}, warn() {}, error() {} },
    defaultEndpointIntervalSeconds: 300,
    routeCatalogService: createRouteCatalogService({
      logger: { info() {}, warn() {}, error() {} },
    }),
  });

  const app = buildApp({
    logger: { info() {}, warn() {}, error() {} },
    registryService,
    schedulerService: {
      async rebuild() {},
    },
  });

  const response = await request(app)
    .post("/register")
    .send({
      serviceName: "sessions-service",
      baseUrl: "http://sessions-service:4010",
      healthEndpoint: "/health",
      endpoints: [
        {
          path: "/sessions",
          method: "POST",
          critical: true,
          intervalSeconds: 120,
          expectedStatus: 201,
        },
      ],
    });

  assert.equal(response.status, 200);
  const saved = await Service.findOne({ serviceName: "sessions-service" }).lean();
  assert.equal(saved.endpoints.length, 1);
  assert.equal(saved.endpoints[0].expectedStatus, 201);
  assert.equal(saved.endpoints[0].successStatusFamily, "2xx");
});

test("re-registration refreshes discovered route metadata without appending monitored endpoints", async () => {
  const registryService = createRegistryService({
    logger: { info() {}, warn() {}, error() {} },
    defaultEndpointIntervalSeconds: 300,
    routeCatalogService: createRouteCatalogService({
      logger: { info() {}, warn() {}, error() {} },
    }),
  });

  const app = buildApp({
    logger: { info() {}, warn() {}, error() {} },
    registryService,
    schedulerService: {
      async rebuild() {},
    },
  });

  await request(app)
    .post("/register")
    .send({
      serviceName: "tenant-router",
      baseUrl: "http://tenant-router:3004",
      healthEndpoint: "/health",
      endpoints: [{ path: "/health", method: "GET", critical: true, intervalSeconds: 30 }],
      discoveredRoutes: [
        {
          path: "/tenant/create",
          method: "POST",
          sourceModule: "src/routes/tenant.routes.js",
          routeType: "mutating",
          middlewareNames: [],
          hasPathParams: false,
          authRequired: false,
          authInference: "unknown",
          monitoringRecommendation: "probe_only",
          successHint: "manual_review",
        },
      ],
    });

  await request(app)
    .post("/register")
    .send({
      serviceName: "tenant-router",
      baseUrl: "http://tenant-router:3004",
      healthEndpoint: "/health",
      endpoints: [{ path: "/health", method: "GET", critical: true, intervalSeconds: 30 }],
      discoveredRoutes: [
        {
          path: "/tenant/create",
          method: "POST",
          sourceModule: "src/routes/tenant.routes.js",
          routeType: "auth",
          middlewareNames: ["requireAuthor"],
          hasPathParams: false,
          authRequired: true,
          authInference: "inferred",
          monitoringRecommendation: "probe_only",
          successHint: "manual_review",
        },
      ],
    });

  const saved = await Service.findOne({ serviceName: "tenant-router" }).lean();
  assert.equal(saved.endpoints.length, 1);

  const discovered = await DiscoveredRoute.findOne({
    serviceName: "tenant-router",
    method: "POST",
    path: "/tenant/create",
  }).lean();
  assert.equal(discovered.routeType, "auth");
  assert.deepEqual(discovered.middlewareNames, ["requireAuthor"]);
  assert.equal(discovered.authRequired, true);
});
