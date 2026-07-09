const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

const { connectMongo, disconnectMongo } = require("../src/db/mongo");
const Service = require("../src/models/Service");
const { buildApp } = require("../src/app");
const { createRegistryService } = require("../src/services/registryService");

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
});

test("POST /register persists a new service in MongoDB", async () => {
  let rebuildCalled = false;
  const registryService = createRegistryService({
    logger: { info() {}, warn() {}, error() {} },
    defaultEndpointIntervalSeconds: 300,
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
      endpoints: [
        { path: "/health", method: "GET", critical: true, intervalSeconds: 30 },
        { path: "/health/monitor", method: "GET", critical: true, intervalSeconds: 60 },
      ],
    });

  assert.equal(response.status, 200);
  assert.equal(response.text, "Registered Successfully");
  assert.equal(rebuildCalled, true);

  const saved = await Service.findOne({ serviceName: "analytics-service" }).lean();
  assert.equal(saved.baseUrl, "http://analytics-service:3006");
  assert.equal(saved.endpoints.length, 2);
  assert.deepEqual(saved.dependencies, ["mongo", "mysql", "redis"]);
});
