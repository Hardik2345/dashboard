const logger = require("./shared/utils/logger");

const DEFAULT_REGISTER_URL = "http://health-monitor-service:4015/register";

async function registerWithHealthMonitor(payload) {
  const registerUrl = process.env.HEALTH_MONITOR_REGISTER_URL || DEFAULT_REGISTER_URL;

  try {
    const response = await fetch(registerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal:
        typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(5000)
          : undefined,
    });
    const text = await response.text();
    if (!response.ok) {
      logger.warn("[health-monitor] registration failed", {
        status: response.status,
        body: text,
      });
      return false;
    }
    logger.info("[health-monitor] registration complete", { body: text });
    return true;
  } catch (error) {
    logger.warn("[health-monitor] registration skipped", { error: error.message });
    return false;
  }
}

module.exports = { registerWithHealthMonitor };
