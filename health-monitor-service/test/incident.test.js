const test = require("node:test");
const assert = require("node:assert/strict");

const { createIncidentService } = require("../src/services/incidentService");
const Incident = require("../src/models/Incident");

function buildLogger() {
  return {
    info() {},
    warn() {},
    error() {},
  };
}

test("incident service opens only one active incident per endpoint", async () => {
  let current = null;
  Incident.findOne = async () => current;
  Incident.create = async (doc) => {
    current = {
      ...doc,
      async save() {
        return this;
      },
    };
    return current;
  };

  const enrichmentEvents = [];
  const incidentService = createIncidentService({
    logger: buildLogger(),
    emailService: {
      async sendIncidentResolved() {},
    },
    incidentEnrichmentService: {
      async enrichIncident(incident) {
        enrichmentEvents.push(incident.incidentId);
      },
    },
  });

  const first = await incidentService.openIncident({
    serviceName: "alerts-service",
    endpoint: "GET /health/monitor",
    critical: true,
    failure: { responseSummary: "boom" },
  });
  const second = await incidentService.openIncident({
    serviceName: "alerts-service",
    endpoint: "GET /health/monitor",
    critical: true,
    failure: { responseSummary: "boom-2" },
  });

  assert.equal(first.incidentId, second.incidentId);
  assert.equal(current.failureCount, 2);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(enrichmentEvents.length, 1);
});

test("incident service throttles repeated open-incident emails until reminder interval passes", async () => {
  const now = Date.now();
  const existing = {
    incidentId: "incident-1",
    service: "alerts-service",
    endpoint: "GET /health",
    incidentType: "health_check",
    status: "OPEN",
    startedAt: new Date(now - 10000),
    lastAlertedAt: new Date(now - 5 * 60 * 1000),
    failureCount: 1,
    totalRetries: 0,
    async save() {
      return this;
    },
  };

  Incident.findOne = async () => existing;
  let reminderCalls = 0;
  const incidentService = createIncidentService({
    logger: buildLogger(),
    emailService: {
      async sendIncidentResolved() {},
    },
    incidentEnrichmentService: {
      async enrichIncident() {},
      async enrichIncidentInternal() {
        reminderCalls += 1;
      },
    },
    openIncidentEmailReminderIntervalMs: 30 * 60 * 1000,
  });

  await incidentService.openIncident({
    serviceName: "alerts-service",
    endpoint: "GET /health",
    critical: true,
    failure: { responseSummary: "still down" },
  });
  assert.equal(reminderCalls, 0);

  existing.lastAlertedAt = new Date(now - 31 * 60 * 1000);
  await incidentService.openIncident({
    serviceName: "alerts-service",
    endpoint: "GET /health",
    critical: true,
    failure: { responseSummary: "still down" },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reminderCalls, 1);
});

test("incident service resolves an open incident", async () => {
  const existing = {
    incidentId: "incident-1",
    service: "alerts-service",
    endpoint: "GET /health/monitor",
    status: "OPEN",
    startedAt: new Date(Date.now() - 1000),
    async save() {
      return this;
    },
  };
  Incident.findOne = async () => existing;

  let resolvedId = null;
  const incidentService = createIncidentService({
    logger: buildLogger(),
    emailService: {
      async sendIncidentOpened() {},
      async sendIncidentResolved(incident) {
        resolvedId = incident.incidentId;
      },
    },
    incidentEnrichmentService: {
      async enrichIncident() {},
    },
  });

  const result = await incidentService.resolveIncident({
    serviceName: "alerts-service",
    endpoint: "GET /health/monitor",
  });

  assert.equal(result.status, "RESOLVED");
  assert.equal(resolvedId, "incident-1");
});

test("incident service resolves open application incidents by resolution key", async () => {
  const first = {
    incidentId: "incident-1",
    service: "analytics-service",
    endpoint: "GET /metrics/summary",
    incidentType: "application_failure",
    resolutionKey: "analytics-service::GET::/metrics/summary",
    status: "OPEN",
    startedAt: new Date(Date.now() - 1000),
    async save() {
      return this;
    },
  };

  Incident.find = async () => [first];

  const resolvedIds = [];
  const incidentService = createIncidentService({
    logger: buildLogger(),
    emailService: {
      async sendIncidentOpened() {},
      async sendIncidentResolved(incident) {
        resolvedIds.push(incident.incidentId);
      },
    },
    incidentEnrichmentService: {
      async enrichIncident() {},
    },
  });

  const result = await incidentService.resolveApplicationIncidents({
    serviceName: "analytics-service",
    resolutionKey: "analytics-service::GET::/metrics/summary",
  });

  assert.equal(result.length, 1);
  assert.deepEqual(resolvedIds, ["incident-1"]);
});
