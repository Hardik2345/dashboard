const test = require("node:test");
const assert = require("node:assert/strict");

const ApplicationEvent = require("../src/models/ApplicationEvent");
const Incident = require("../src/models/Incident");
const Service = require("../src/models/Service");
const DiscoveredRoute = require("../src/models/DiscoveredRoute");
const { createApplicationEventService } = require("../src/services/applicationEventService");

function buildLogger() {
  return {
    info() {},
    warn() {},
    error() {},
  };
}

test("application event service opens an incident immediately for 5xx failures", async () => {
  const createdEvents = [];
  ApplicationEvent.create = async (doc) => ({ _id: "event-1", ...doc });
  ApplicationEvent.updateOne = async () => ({ acknowledged: true });
  ApplicationEvent.countDocuments = async () => 1;
  Incident.findOne = () => ({ sort: async () => null });
  Service.findOne = () => ({ lean: async () => ({ serviceName: "analytics-service", baseUrl: "http://analytics-service:3006", dependencies: ["mongo"] }) });
  DiscoveredRoute.findOne = () => ({ lean: async () => null });
  ApplicationEvent.create = async (doc) => {
    createdEvents.push(doc);
    return { _id: "event-1", ...doc };
  };

  let openedIncident = null;
  const service = createApplicationEventService({
    logger: buildLogger(),
    incidentService: {
      async openIncident(payload) {
        openedIncident = payload;
        return { incidentId: "incident-1", status: "OPEN" };
      },
      async resolveApplicationIncidents() {
        return [];
      },
    },
    fourXxThresholdCount: 5,
    fourXxThresholdWindowMs: 600000,
    reopenCooldownMs: 600000,
    payloadStringMaxLength: 2000,
    headerValueMaxLength: 300,
  });

  const result = await service.ingestFailureEvent({
    serviceName: "analytics-service",
    baseUrl: "http://analytics-service:3006",
    method: "GET",
    path: "/metrics/summary",
    normalizedPath: "/metrics/summary",
    statusCode: 500,
    message: "database query failed",
    responseBody: {
      errorType: "application_exception",
      errorCode: "summary_query_failed",
      message: "database query failed",
      password: "secret",
    },
    responseHeaders: {
      "content-type": "application/json",
      authorization: "Bearer 123",
    },
    requestContext: {
      headers: {
        authorization: "Bearer abc",
      },
      query: { range: "90d" },
      body: { token: "abc" },
    },
  });

  assert.equal(result.incidentOpened, true);
  assert.equal(openedIncident.incidentType, "application_failure");
  assert.equal(openedIncident.endpoint, "GET /metrics/summary");
  assert.equal(openedIncident.failure.applicationEvent.errorCode, "summary_query_failed");
  assert.equal(createdEvents[0].responseHeaders.authorization, "[REDACTED]");
  assert.equal(createdEvents[0].responseBody.password, "[REDACTED]");
  assert.equal(createdEvents[0].requestContext.body.token, "[REDACTED]");
});

test("application event service thresholds 4xx failures before opening incidents", async () => {
  ApplicationEvent.create = async (doc) => ({ _id: "event-2", ...doc });
  ApplicationEvent.updateOne = async () => ({ acknowledged: true });
  Incident.findOne = () => ({ sort: async () => null });
  Service.findOne = () => ({ lean: async () => ({ serviceName: "tenant-router", baseUrl: "http://tenant-router:3004", dependencies: ["mongo"] }) });
  DiscoveredRoute.findOne = () => ({ lean: async () => null });

  let openCount = 0;
  let nextCount = 4;
  const service = createApplicationEventService({
    logger: buildLogger(),
    incidentService: {
      async openIncident() {
        openCount += 1;
        return { incidentId: "incident-4xx", status: "OPEN" };
      },
      async resolveApplicationIncidents() {
        return [];
      },
    },
    fourXxThresholdCount: 5,
    fourXxThresholdWindowMs: 600000,
    reopenCooldownMs: 600000,
    payloadStringMaxLength: 2000,
    headerValueMaxLength: 300,
  });
  ApplicationEvent.countDocuments = async () => nextCount;

  const first = await service.ingestFailureEvent({
    serviceName: "tenant-router",
    baseUrl: "http://tenant-router:3004",
    method: "POST",
    path: "/tenant",
    normalizedPath: "/tenant",
    statusCode: 400,
    responseBody: { error: "validation_failed" },
  });

  nextCount = 5;
  const second = await service.ingestFailureEvent({
    serviceName: "tenant-router",
    baseUrl: "http://tenant-router:3004",
    method: "POST",
    path: "/tenant",
    normalizedPath: "/tenant",
    statusCode: 400,
    responseBody: { error: "validation_failed" },
  });

  assert.equal(first.incidentOpened, false);
  assert.equal(second.thresholdBreached, true);
  assert.equal(openCount, 1);
});

test("application event service resolves application incidents on success events", async () => {
  ApplicationEvent.create = async (doc) => ({ _id: "event-3", ...doc });
  DiscoveredRoute.findOne = () => ({ lean: async () => null });

  let resolvePayload = null;
  const service = createApplicationEventService({
    logger: buildLogger(),
    incidentService: {
      async openIncident() {
        throw new Error("not expected");
      },
      async resolveApplicationIncidents(payload) {
        resolvePayload = payload;
        return [{ incidentId: "incident-1" }];
      },
    },
    fourXxThresholdCount: 5,
    fourXxThresholdWindowMs: 600000,
    reopenCooldownMs: 600000,
    payloadStringMaxLength: 2000,
    headerValueMaxLength: 300,
  });

  const result = await service.ingestSuccessEvent({
    serviceName: "sessions-service",
    baseUrl: "http://sessions-service:4010",
    method: "POST",
    path: "/sessions",
    normalizedPath: "/sessions",
    statusCode: 201,
  });

  assert.equal(result.resolvedCount, 1);
  assert.equal(resolvePayload.serviceName, "sessions-service");
  assert.match(resolvePayload.resolutionKey, /POST::\/sessions$/);
});
