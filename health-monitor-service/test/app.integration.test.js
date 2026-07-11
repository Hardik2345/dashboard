const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { buildApp } = require("../src/app");

test("POST /register returns the registration message", async () => {
  let rebuildCalled = false;
  const app = buildApp({
    logger: {
      error() {},
      warn() {},
      info() {},
    },
    registryService: {
      async register() {
        return { message: "Registered Successfully", changed: true };
      },
    },
    schedulerService: {
      async rebuild() {
        rebuildCalled = true;
      },
    },
  });

  const response = await request(app)
    .post("/register")
    .send({
      serviceName: "alerts-service",
      baseUrl: "http://alerts-service:5005",
      healthEndpoint: "/health",
      endpoints: [{ path: "/health", method: "GET", critical: true, intervalSeconds: 30 }],
    });

  assert.equal(response.status, 200);
  assert.equal(response.text, "Registered Successfully");
  assert.equal(rebuildCalled, true);
});
