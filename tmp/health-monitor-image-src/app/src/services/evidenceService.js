const Evidence = require("../models/Evidence");
const { requestJson } = require("./httpClient");
const { withTimeout } = require("../utils/withTimeout");

function createEvidenceService({
  logger,
  logProvider,
  healthProbeTimeoutMs,
  dependencyCheckTimeoutMs,
  dockerLogTimeoutMs,
  apiResponseEvidenceTimeoutMs,
}) {
  async function persistEvidence(doc) {
    return Evidence.create({
      ...doc,
      collectedAt: new Date(),
    });
  }

  async function collectApiResponse({ incident, failure }) {
    return withTimeout(
      () =>
        persistEvidence({
          incidentId: incident.incidentId,
          service: incident.service,
          endpoint: incident.endpoint,
          type: "api_response",
          payload: {
            responseCode: failure.responseCode ?? null,
            responseHeaders: failure.responseHeaders || {},
            responseBody: failure.responseBody ?? "",
            responseSummary: failure.responseSummary || "",
            latency: failure.latency ?? null,
          },
        }),
      apiResponseEvidenceTimeoutMs,
      `api_response:${incident.incidentId}`,
    ).catch((error) => {
      logger.warn("evidence.api_response_failed", {
        incidentId: incident.incidentId,
        error: error.message,
      });
      throw error;
    });
  }

  async function collectHealthProbe({ incident, serviceDoc }) {
    return withTimeout(async () => {
      const url = `${String(serviceDoc.baseUrl || "").replace(/\/$/, "")}/health/monitor`;
      const response = await requestJson(url, {
        method: "GET",
        timeoutMs: healthProbeTimeoutMs,
      });

      const evidence = await persistEvidence({
        incidentId: incident.incidentId,
        service: incident.service,
        endpoint: incident.endpoint,
        type: "health_probe",
        payload: {
          status: response.status,
          ok: response.ok,
          headers: response.headers,
          body: response.json ?? response.text,
        },
      });

      return {
        evidence,
        response,
      };
    }, healthProbeTimeoutMs, `health_probe:${incident.incidentId}`).catch((error) => {
      logger.warn("evidence.health_probe_failed", {
        incidentId: incident.incidentId,
        error: error.message,
      });
      throw error;
    });
  }

  async function collectDependencyCheck({ incident, serviceDoc, probeResponse }) {
    return withTimeout(async () => {
      const declaredDependencies = Array.isArray(serviceDoc.dependencies)
        ? serviceDoc.dependencies
        : [];
      const reportedDependencies =
        probeResponse?.json?.dependencies && typeof probeResponse.json.dependencies === "object"
          ? probeResponse.json.dependencies
          : {};

      const payload = {};
      for (const dependency of declaredDependencies) {
        const entry = reportedDependencies[dependency];
        payload[dependency] = {
          status: entry?.status || "DOWN",
          message: entry?.message || "dependency_not_reported",
        };
      }

      const evidence = await persistEvidence({
        incidentId: incident.incidentId,
        service: incident.service,
        endpoint: incident.endpoint,
        type: "dependency_check",
        payload,
      });

      return { evidence, payload };
    }, dependencyCheckTimeoutMs, `dependency_check:${incident.incidentId}`).catch((error) => {
      logger.warn("evidence.dependency_check_failed", {
        incidentId: incident.incidentId,
        error: error.message,
      });
      throw error;
    });
  }

  async function collectApplicationLogs({ incident, serviceDoc }) {
    return withTimeout(async () => {
      const logResult = await logProvider.getRecentLogs(serviceDoc.serviceName);
      const evidence = await persistEvidence({
        incidentId: incident.incidentId,
        service: incident.service,
        endpoint: incident.endpoint,
        type: "application_logs",
        payload: logResult,
      });
      return { evidence, payload: logResult };
    }, dockerLogTimeoutMs, `application_logs:${incident.incidentId}`).catch((error) => {
      logger.warn("evidence.application_logs_failed", {
        incidentId: incident.incidentId,
        error: error.message,
      });
      throw error;
    });
  }

  return {
    collectApiResponse,
    collectHealthProbe,
    collectDependencyCheck,
    collectApplicationLogs,
  };
}

module.exports = { createEvidenceService };
