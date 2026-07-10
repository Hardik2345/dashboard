const Incident = require("../models/Incident");

function buildIncidentId(serviceName, endpoint, startedAt) {
  return `${serviceName}-${endpoint.replace(/[^a-zA-Z0-9]+/g, "-")}-${startedAt.getTime()}`;
}

function createIncidentService({ logger, emailService, incidentEnrichmentService }) {
  async function openIncident({ serviceName, endpoint, critical, failure, retryAttempts = 0, serviceDoc = null }) {
    const existing = await Incident.findOne({
      service: serviceName,
      endpoint,
      status: "OPEN",
    });

    if (existing) {
      existing.failureCount += 1;
      existing.lastFailure = failure;
      await existing.save();
      logger.warn("incident.updated", {
        incidentId: existing.incidentId,
        serviceName,
        endpoint,
      });
      return existing;
    }

    const startedAt = new Date();
    const incident = await Incident.create({
      incidentId: buildIncidentId(serviceName, endpoint, startedAt),
      service: serviceName,
      endpoint,
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
    });
    incidentEnrichmentService.enrichIncident({
      incident,
      failure,
      serviceDoc,
      retryAttempts,
    }).catch((error) => {
      logger.error("incident.enrichment_failed", {
        incidentId: incident.incidentId,
        error: error.message,
      });
    });
    return incident;
  }

  async function resolveIncident({ serviceName, endpoint }) {
    const existing = await Incident.findOne({
      service: serviceName,
      endpoint,
      status: "OPEN",
    });

    if (!existing) {
      return null;
    }

    existing.status = "RESOLVED";
    existing.resolvedAt = new Date();
    existing.duration = existing.resolvedAt.getTime() - existing.startedAt.getTime();
    await existing.save();

    logger.info("incident.resolved", {
      incidentId: existing.incidentId,
      serviceName,
      endpoint,
      duration: existing.duration,
    });
    await emailService.sendIncidentResolved(existing);
    return existing;
  }

  return {
    openIncident,
    resolveIncident,
  };
}

module.exports = { createIncidentService };
