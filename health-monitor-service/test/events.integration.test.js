const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { buildApp } = require("../src/app");

function buildLogger() {
  return {
    error() {},
    warn() {},
    info() {},
  };
}

test("POST /events/failures forwards application failure events", async () => {
  let payload = null;
  const app = buildApp({
    logger: buildLogger(),
    registryService: {
      async register() {
        return { message: "Registered Successfully", changed: false };
      },
    },
    schedulerService: {
      async rebuild() {},
    },
    applicationEventService: {
      async ingestFailureEvent(body) {
        payload = body;
        return { accepted: true, incidentOpened: true };
      },
      async ingestSuccessEvent() {
        return { accepted: true, resolvedCount: 0 };
      },
    },
  });

  const response = await request(app)
    .post("/events/failures")
    .send({
      serviceName: "alerts-service",
      method: "POST",
      path: "/push/register-token",
      normalizedPath: "/push/register-token",
      statusCode: 500,
    });

  assert.equal(response.status, 202);
  assert.equal(response.body.accepted, true);
  assert.equal(payload.serviceName, "alerts-service");
});

test("POST /events/successes forwards application success events", async () => {
  let payload = null;
  const app = buildApp({
    logger: buildLogger(),
    registryService: {
      async register() {
        return { message: "Registered Successfully", changed: false };
      },
    },
    schedulerService: {
      async rebuild() {},
    },
    applicationEventService: {
      async ingestFailureEvent() {
        return { accepted: true };
      },
      async ingestSuccessEvent(body) {
        payload = body;
        return { accepted: true, resolvedCount: 1 };
      },
    },
  });

  const response = await request(app)
    .post("/events/successes")
    .send({
      serviceName: "analytics-service",
      method: "GET",
      path: "/metrics/summary",
      normalizedPath: "/metrics/summary",
      statusCode: 200,
    });

  assert.equal(response.status, 202);
  assert.equal(response.body.resolvedCount, 1);
  assert.equal(payload.normalizedPath, "/metrics/summary");
});
