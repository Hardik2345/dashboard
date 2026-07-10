const test = require("node:test");
const assert = require("node:assert/strict");

const Incident = require("../src/models/Incident");
const { createIncidentEnrichmentService } = require("../src/services/incidentEnrichmentService");

function buildLogger() {
  return {
    info() {},
    warn() {},
    error() {},
  };
}

test("incident enrichment updates incident metadata and sends enriched email", async () => {
  let updatedDoc = null;
  Incident.findOneAndUpdate = async (_query, update) => {
    updatedDoc = update.$set;
    return {
      incidentId: "incident-1",
      service: "alerts-service",
      endpoint: "GET /health/monitor",
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
      ...update.$set,
    };
  };

  let emailPayload = null;
  const service = createIncidentEnrichmentService({
    logger: buildLogger(),
    emailService: {
      async sendIncidentOpened(payload) {
        emailPayload = payload;
      },
    },
    evidenceService: {
      async collectApiResponse() {
        return { payload: { responseCode: 503 } };
      },
      async collectHealthProbe() {
        return {
          response: {
            status: 503,
            json: {
              message: "mongo_down",
              dependencies: {
                mongo: { status: "DOWN", message: "mongo_down" },
                redis: { status: "UP", message: "ping_ok" },
              },
            },
          },
        };
      },
      async collectDependencyCheck() {
        return {
          payload: {
            mongo: { status: "DOWN", message: "mongo_down" },
            redis: { status: "UP", message: "ping_ok" },
          },
        };
      },
      async collectApplicationLogs() {
        return {
          payload: {
            lines: ["one", "two"],
          },
        };
      },
    },
    emailLogTruncationLength: 1000,
  });

  await service.enrichIncident({
    incident: {
      incidentId: "incident-1",
      service: "alerts-service",
      endpoint: "GET /health/monitor",
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    failure: {
      responseCode: 503,
      responseSummary: "failed",
    },
    serviceDoc: {
      serviceName: "alerts-service",
      baseUrl: "http://alerts-service:5005",
      dependencies: ["mongo", "redis"],
    },
    retryAttempts: 2,
  });

  assert.equal(updatedDoc.evidenceCount, 4);
  assert.deepEqual(updatedDoc.dependencySummary, {
    mongo: "DOWN",
    redis: "UP",
  });
  assert.equal(updatedDoc.totalRetries, 2);
  assert.equal(emailPayload.incident.incidentId, "incident-1");
  assert.equal(emailPayload.enrichment.logs, "one\ntwo");
});
