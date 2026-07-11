const MonitorRun = require("../models/MonitorRun");

function truncateSummary(input, maxLength) {
  const text = String(input == null ? "" : input).trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function createMonitorRunService({ responseSummaryMaxLength }) {
  async function record(result) {
    await MonitorRun.create({
      service: result.service,
      endpoint: result.endpoint,
      timestamp: result.timestamp || new Date(),
      status: result.status,
      responseCode: result.responseCode ?? null,
      latency: result.latency ?? null,
      responseSummary: truncateSummary(result.responseSummary, responseSummaryMaxLength),
    });
  }

  return {
    record,
    truncateSummary,
  };
}

module.exports = { createMonitorRunService, truncateSummary };
