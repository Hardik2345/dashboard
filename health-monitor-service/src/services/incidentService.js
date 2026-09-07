const Incident = require("../models/Incident");

function buildIncidentId(serviceName, endpoint, startedAt) {
  return `${serviceName}-${endpoint.replace(/[^a-zA-Z0-9]+/g, "-")}-${startedAt.getTime()}`;
}

function createIncidentService({
  logger,
  emailService,
  incidentEnrichmentService,
  openIncidentEmailReminderIntervalMs = 30 * 60 * 1000,
}) {
  function buildOpenQuery({ serviceName, endpoint, incidentType, fingerprint }) {
    const query = {
      service: serviceName,
      endpoint,
      incidentType,
      status: "OPEN",
    };

    if (incidentType === "application_failure") {
      query.fingerprint = fingerprint;
    }

    return query;
  }

  function shouldSendReminder(existing) {
    if (!openIncidentEmailReminderIntervalMs) return false;
    const baseline = existing.lastAlertedAt || existing.startedAt;
    if (!baseline) return false;
    const baselineDate = new Date(baseline);
    if (Number.isNaN(baselineDate.getTime())) return false;
    return (Date.now() - baselineDate.getTime()) >= openIncidentEmailReminderIntervalMs;
  }

  function triggerEnrichment(payload, logKey) {
    const run = incidentEnrichmentService.enrichIncidentInternal
      || incidentEnrichmentService.enrichIncident;
    if (typeof run !== "function") {
      return;
    }

    run(payload).catch((error) => {
      logger.error(logKey, {
        incidentId: payload.incident.incidentId,
        error: error.message,
      });
    });
  }

  async function openIncident({
    serviceName,
    endpoint,
    critical,
    failure,
    retryAttempts = 0,
    serviceDoc = null,
    incidentType = "health_check",
    fingerprint = "",
    resolutionKey = "",
  }) {
    const existing = await Incident.findOne(
      buildOpenQuery({
        serviceName,
        endpoint,
        incidentType,
        fingerprint,
      }),
    );

    if (existing) {
      existing.failureCount += 1;
      existing.lastFailure = failure;
      existing.totalRetries = Math.max(existing.totalRetries || 0, retryAttempts || 0);
      await existing.save();
      logger.warn("incident.updated", {
        incidentId: existing.incidentId,
        serviceName,
        endpoint,
        incidentType,
      });

      if (shouldSendReminder(existing)) {
        triggerEnrichment({
          incident: existing,
          failure,
          serviceDoc,
          retryAttempts,
          sendEmail: true,
        }, "incident.reminder_failed");
      }
      return existing;
    }

    const startedAt = new Date();
    const incident = await Incident.create({
      incidentId: buildIncidentId(serviceName, endpoint, startedAt),
      service: serviceName,
      endpoint,
      incidentType,
      fingerprint,
      resolutionKey,
      severity: critical ? "CRITICAL" : "WARNING",
      status: "OPEN",
      startedAt,
      failureCount: 1,
      totalRetries: retryAttempts,
      lastFailure: failure,
    });

    logger.error("incident.opened", {
      incidentId: incident.incidentId,
      serviceName,
      endpoint,
      incidentType,
    });
    triggerEnrichment({
      incident,
      failure,
      serviceDoc,
      retryAttempts,
      sendEmail: true,
    }, "incident.enrichment_failed");
    return incident;
  }

  async function resolveOneIncident(existing, extraLog = {}) {
    existing.status = "RESOLVED";
    existing.resolvedAt = new Date();
    existing.duration = existing.resolvedAt.getTime() - existing.startedAt.getTime();
    await existing.save();

    logger.info("incident.resolved", {
      incidentId: existing.incidentId,
      serviceName: existing.service,
      endpoint: existing.endpoint,
      duration: existing.duration,
      incidentType: existing.incidentType,
      ...extraLog,
    });
    await emailService.sendIncidentResolved(existing);
    return existing;
  }

  async function resolveIncident({ serviceName, endpoint, incidentType = "health_check" }) {
    const existing = await Incident.findOne({
      service: serviceName,
      endpoint,
      incidentType,
      status: "OPEN",
    });

    if (!existing) {
      return null;
    }

    return resolveOneIncident(existing);
  }

  async function resolveApplicationIncidents({ serviceName, resolutionKey }) {
    const incidents = await Incident.find({
      service: serviceName,
      incidentType: "application_failure",
      resolutionKey,
      status: "OPEN",
    });

    const resolved = [];
    for (const incident of incidents) {
      resolved.push(await resolveOneIncident(incident, { resolutionKey }));
    }
    return resolved;
  }

  return {
    openIncident,
    resolveIncident,
    resolveApplicationIncidents,
    shouldSendReminder,
  };
}

module.exports = { createIncidentService };
