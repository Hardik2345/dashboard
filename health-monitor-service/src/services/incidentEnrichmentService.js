const Incident = require("../models/Incident");
const Service = require("../models/Service");

function truncateLines(lines, maxLength) {
  const joined = Array.isArray(lines) ? lines.join("\n") : "";
  if (joined.length <= maxLength) {
    return joined;
  }
  return `${joined.slice(0, Math.max(0, maxLength - 3))}...`;
}

function buildProbeMessage(probeResponse) {
  if (!probeResponse) return "";
  if (probeResponse.json?.message) return String(probeResponse.json.message);
  if (probeResponse.json?.error) return String(probeResponse.json.error);
  if (probeResponse.text) return String(probeResponse.text).slice(0, 300);
  return "";
}

function buildDependencySummary(payload) {
  const summary = {};
  for (const [dependency, details] of Object.entries(payload || {})) {
    summary[dependency] = details?.status || "DOWN";
  }
  return summary;
}

function createIncidentEnrichmentService({
  logger,
  evidenceService,
  emailService,
  emailLogTruncationLength,
}) {
  async function enrichIncident({ incident, failure, serviceDoc, retryAttempts }) {
    const resolvedServiceDoc =
      serviceDoc || (await Service.findOne({ serviceName: incident.service }).lean());

    if (!resolvedServiceDoc) {
      logger.warn("incident.enrichment_missing_service", {
        incidentId: incident.incidentId,
        service: incident.service,
      });
      return incident;
    }

    const results = {};

    const [apiResponseResult, healthProbeResult, logResult] = await Promise.allSettled([
      evidenceService.collectApiResponse({ incident, failure }),
      evidenceService.collectHealthProbe({ incident, serviceDoc: resolvedServiceDoc }),
      evidenceService.collectApplicationLogs({ incident, serviceDoc: resolvedServiceDoc }),
    ]);
    results.apiResponse = apiResponseResult;
    results.healthProbe = healthProbeResult;
    results.applicationLogs = logResult;

    const dependencyResult = await Promise.allSettled([
      evidenceService.collectDependencyCheck({
        incident,
        serviceDoc: resolvedServiceDoc,
        probeResponse:
          results.healthProbe.status === "fulfilled" ? results.healthProbe.value.response : null,
      }),
    ]);
    results.dependencyCheck = dependencyResult[0];

    const evidenceCount = Object.values(results).filter((entry) => entry.status === "fulfilled").length;
    const dependencyPayload =
      results.dependencyCheck.status === "fulfilled" ? results.dependencyCheck.value.payload : {};
    const probeResponse =
      results.healthProbe.status === "fulfilled" ? results.healthProbe.value.response : null;
    const logsPayload =
      results.applicationLogs.status === "fulfilled" ? results.applicationLogs.value.payload : null;

    const updatedIncident = await Incident.findOneAndUpdate(
      { incidentId: incident.incidentId },
      {
        $set: {
          evidenceCount,
          dependencySummary: buildDependencySummary(dependencyPayload),
          lastProbeStatus: probeResponse?.status ?? null,
          lastProbeMessage: buildProbeMessage(probeResponse),
          totalRetries: retryAttempts ?? incident.totalRetries ?? 0,
        },
      },
      { new: true },
    );

    await emailService.sendIncidentOpened({
      incident: updatedIncident || incident,
      failure,
      enrichment: {
        healthProbe: probeResponse,
        dependencyPayload,
        logs: truncateLines(logsPayload?.lines || [], emailLogTruncationLength),
      },
    });

    return updatedIncident || incident;
  }

  return {
    enrichIncident,
  };
}

module.exports = { createIncidentEnrichmentService, buildDependencySummary, truncateLines };
