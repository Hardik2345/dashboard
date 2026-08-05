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

function normalizeLogsPayload(logsPayload) {
  if (!logsPayload) return [];
  if (Array.isArray(logsPayload.lines)) return logsPayload.lines;
  if (Array.isArray(logsPayload)) return logsPayload;
  if (typeof logsPayload === "string") return logsPayload.split("\n");
  return [];
}

function createIncidentEnrichmentService({
  logger,
  evidenceService,
  emailService,
  emailLogTruncationLength,
}) {
  async function enrichIncident({ incident, failure, serviceDoc, retryAttempts }) {
    return enrichIncidentInternal({
      incident,
      failure,
      serviceDoc,
      retryAttempts,
      sendEmail: true,
    });
  }

  async function enrichIncidentInternal({
    incident,
    failure,
    serviceDoc,
    retryAttempts,
    sendEmail,
  }) {
    const resolvedServiceDoc =
      serviceDoc || (await Service.findOne({ serviceName: incident.service }).lean());

    const results = {};

    const [apiResponseResult, healthProbeResult, logResult] = await Promise.allSettled([
      evidenceService.collectApiResponse({ incident, failure }),
      resolvedServiceDoc
        ? evidenceService.collectHealthProbe({ incident, serviceDoc: resolvedServiceDoc })
        : Promise.reject(new Error("service_doc_unavailable")),
      resolvedServiceDoc
        ? evidenceService.collectApplicationLogs({ incident, serviceDoc: resolvedServiceDoc })
        : Promise.reject(new Error("service_doc_unavailable")),
    ]);
    results.apiResponse = apiResponseResult;
    results.healthProbe = healthProbeResult;
    results.applicationLogs = logResult;

    const dependencyResult = await Promise.allSettled([
      resolvedServiceDoc
        ? evidenceService.collectDependencyCheck({
          incident,
          serviceDoc: resolvedServiceDoc,
          probeResponse:
            results.healthProbe.status === "fulfilled" ? results.healthProbe.value.response : null,
        })
        : Promise.reject(new Error("service_doc_unavailable")),
    ]);
    results.dependencyCheck = dependencyResult[0];

    const evidenceCount = Object.values(results).filter((entry) => entry.status === "fulfilled").length;
    const dependencyPayload =
      results.dependencyCheck.status === "fulfilled" ? results.dependencyCheck.value.payload : {};
    const probeResponse =
      results.healthProbe.status === "fulfilled" ? results.healthProbe.value.response : null;
    const logsPayload =
      results.applicationLogs.status === "fulfilled" ? results.applicationLogs.value.payload : null;

    const updateDoc = {
      evidenceCount,
      dependencySummary: buildDependencySummary(dependencyPayload),
      lastProbeStatus: probeResponse?.status ?? null,
      lastProbeMessage: buildProbeMessage(probeResponse),
      totalRetries: retryAttempts ?? incident.totalRetries ?? 0,
    };

    if (sendEmail) {
      updateDoc.lastAlertedAt = new Date();
    }

    const updatedIncident = await Incident.findOneAndUpdate(
      { incidentId: incident.incidentId },
      { $set: updateDoc },
      { new: true },
    );

    if (sendEmail) {
      await emailService.sendIncidentOpened({
        incident: updatedIncident || incident,
        failure,
        enrichment: {
          healthProbe: probeResponse,
          dependencyPayload,
          logs: truncateLines(normalizeLogsPayload(logsPayload), emailLogTruncationLength),
        },
      });
    }

    return updatedIncident || incident;
  }

  return {
    enrichIncident,
    enrichIncidentInternal,
  };
}

module.exports = { createIncidentEnrichmentService, buildDependencySummary, truncateLines };
