const { requestJson } = require("./httpClient");

function summarizeResponse(payload) {
  if (payload == null) return "";
  if (typeof payload === "string") return payload;
  return JSON.stringify(payload);
}

function createExecutorService({ logger, requestTimeoutMs }) {
  async function executeCheck(serviceDoc, endpoint) {
    const startedAt = Date.now();
    const url = `${String(serviceDoc.baseUrl || "").replace(/\/$/, "")}${endpoint.path}`;
    try {
      const response = await requestJson(url, {
        method: endpoint.method,
        timeoutMs: requestTimeoutMs,
      });
      const latency = Date.now() - startedAt;
      const success = response.status === endpoint.expectedStatus;
      const result = {
        service: serviceDoc.serviceName,
        endpoint: `${endpoint.method} ${endpoint.path}`,
        timestamp: new Date(),
        status: success ? "SUCCESS" : "FAILURE",
        responseCode: response.status,
        latency,
        responseSummary: summarizeResponse(response.json ?? response.text),
      };

      logger.info("health.check", {
        serviceName: serviceDoc.serviceName,
        endpoint: result.endpoint,
        status: result.status,
        responseCode: result.responseCode,
        latency,
      });

      return result;
    } catch (error) {
      const latency = Date.now() - startedAt;
      logger.warn("health.check_failed", {
        serviceName: serviceDoc.serviceName,
        endpoint: `${endpoint.method} ${endpoint.path}`,
        error: error.message,
      });
      return {
        service: serviceDoc.serviceName,
        endpoint: `${endpoint.method} ${endpoint.path}`,
        timestamp: new Date(),
        status: "FAILURE",
        responseCode: null,
        latency,
        responseSummary: error.message,
      };
    }
  }

  return {
    executeCheck,
  };
}

module.exports = { createExecutorService };
