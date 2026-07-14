const DEFAULT_RETRY_COUNT = 2;
const DEFAULT_RETRY_INTERVAL_MS = 5000;
const DEFAULT_ENDPOINT_INTERVAL_SECONDS = 300;
const DEFAULT_REGISTRATION_VALIDATION_INTERVAL_HOURS = 3;
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const DEFAULT_RESPONSE_SUMMARY_MAX_LENGTH = 500;
const DEFAULT_EVIDENCE_COLLECTION_TIMEOUT_MS = 10000;
const DEFAULT_HEALTH_LOG_LINES = 100;
const DEFAULT_EMAIL_LOG_TRUNCATION_LENGTH = 1000;
const DEFAULT_APPLICATION_FAILURE_4XX_THRESHOLD_COUNT = 5;
const DEFAULT_APPLICATION_FAILURE_4XX_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_APPLICATION_FAILURE_REOPEN_COOLDOWN_MS = 10 * 60 * 1000;
const DEFAULT_APPLICATION_EVENT_PAYLOAD_MAX_LENGTH = 2000;
const DEFAULT_APPLICATION_EVENT_HEADER_VALUE_MAX_LENGTH = 300;
const DEFAULT_OPEN_INCIDENT_EMAIL_REMINDER_INTERVAL_MS = 30 * 60 * 1000;

function toNumber(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

function getConfig() {
  const alertRecipients = String(process.env.ALERT_RECIPIENTS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return {
    port: Number(process.env.HEALTH_MONITOR_PORT || 4015),
    mongoUri:
      process.env.HEALTH_MONITOR_MONGO_URI ||
      process.env.MONGO_URI ||
      "mongodb://localhost:27017/datum_health_monitor",
    mongoDb: process.env.HEALTH_MONITOR_MONGO_DB || "datum_health_monitor",
    retryCount: toNumber(process.env.HEALTH_RETRY_COUNT, DEFAULT_RETRY_COUNT),
    retryIntervalMs: toNumber(
      process.env.HEALTH_RETRY_INTERVAL_MS,
      DEFAULT_RETRY_INTERVAL_MS,
    ),
    defaultEndpointIntervalSeconds: toNumber(
      process.env.DEFAULT_ENDPOINT_INTERVAL_SECONDS,
      DEFAULT_ENDPOINT_INTERVAL_SECONDS,
    ),
    registrationValidationIntervalHours: toNumber(
      process.env.REGISTRATION_VALIDATION_INTERVAL_HOURS,
      DEFAULT_REGISTRATION_VALIDATION_INTERVAL_HOURS,
    ),
    requestTimeoutMs: toNumber(
      process.env.HEALTH_MONITOR_REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS,
    ),
    responseSummaryMaxLength: toNumber(
      process.env.RESPONSE_SUMMARY_MAX_LENGTH,
      DEFAULT_RESPONSE_SUMMARY_MAX_LENGTH,
    ),
    apiResponseEvidenceTimeoutMs: toNumber(
      process.env.API_RESPONSE_EVIDENCE_TIMEOUT_MS,
      toNumber(process.env.EVIDENCE_COLLECTION_TIMEOUT_MS, DEFAULT_EVIDENCE_COLLECTION_TIMEOUT_MS),
    ),
    healthProbeTimeoutMs: toNumber(
      process.env.HEALTH_PROBE_TIMEOUT_MS,
      toNumber(process.env.EVIDENCE_COLLECTION_TIMEOUT_MS, DEFAULT_EVIDENCE_COLLECTION_TIMEOUT_MS),
    ),
    dependencyCheckTimeoutMs: toNumber(
      process.env.DEPENDENCY_CHECK_TIMEOUT_MS,
      toNumber(process.env.EVIDENCE_COLLECTION_TIMEOUT_MS, DEFAULT_EVIDENCE_COLLECTION_TIMEOUT_MS),
    ),
    dockerLogTimeoutMs: toNumber(
      process.env.DOCKER_LOG_TIMEOUT_MS,
      toNumber(process.env.EVIDENCE_COLLECTION_TIMEOUT_MS, DEFAULT_EVIDENCE_COLLECTION_TIMEOUT_MS),
    ),
    healthLogLines: toNumber(
      process.env.HEALTH_LOG_LINES,
      DEFAULT_HEALTH_LOG_LINES,
    ),
    emailLogTruncationLength: toNumber(
      process.env.EMAIL_LOG_TRUNCATION_LENGTH,
      DEFAULT_EMAIL_LOG_TRUNCATION_LENGTH,
    ),
    applicationFailureFourXxThresholdCount: toNumber(
      process.env.APPLICATION_FAILURE_4XX_THRESHOLD_COUNT,
      DEFAULT_APPLICATION_FAILURE_4XX_THRESHOLD_COUNT,
    ),
    applicationFailureFourXxWindowMs: toNumber(
      process.env.APPLICATION_FAILURE_4XX_WINDOW_MS,
      DEFAULT_APPLICATION_FAILURE_4XX_WINDOW_MS,
    ),
    applicationFailureReopenCooldownMs: toNumber(
      process.env.APPLICATION_FAILURE_REOPEN_COOLDOWN_MS,
      DEFAULT_APPLICATION_FAILURE_REOPEN_COOLDOWN_MS,
    ),
    applicationEventPayloadMaxLength: toNumber(
      process.env.APPLICATION_EVENT_PAYLOAD_MAX_LENGTH,
      DEFAULT_APPLICATION_EVENT_PAYLOAD_MAX_LENGTH,
    ),
    applicationEventHeaderValueMaxLength: toNumber(
      process.env.APPLICATION_EVENT_HEADER_VALUE_MAX_LENGTH,
      DEFAULT_APPLICATION_EVENT_HEADER_VALUE_MAX_LENGTH,
    ),
    openIncidentEmailReminderIntervalMs: toNumber(
      process.env.OPEN_INCIDENT_EMAIL_REMINDER_INTERVAL_MS,
      DEFAULT_OPEN_INCIDENT_EMAIL_REMINDER_INTERVAL_MS,
    ),
    dockerSocketPath: process.env.DOCKER_SOCKET_PATH || "/var/run/docker.sock",
    logLevel: process.env.LOG_LEVEL || "info",
    smtp: {
      host: process.env.GMAIL_SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.GMAIL_SMTP_PORT || 587),
      user: process.env.GMAIL_EMAIL || "",
      pass: process.env.GMAIL_APP_PASSWORD || "",
      recipients: alertRecipients,
      subjectPrefix: process.env.INCIDENT_EMAIL_SUBJECT_PREFIX || "[Datum Health]",
    },
  };
}

module.exports = {
  getConfig,
  DEFAULT_ENDPOINT_INTERVAL_SECONDS,
};
