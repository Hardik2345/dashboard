const ApplicationEvent = require("../models/ApplicationEvent");
const Incident = require("../models/Incident");
const Service = require("../models/Service");
const DiscoveredRoute = require("../models/DiscoveredRoute");

const SENSITIVE_KEY_PATTERN = /(authorization|cookie|token|password|secret|api[-_]?key|set-cookie)/i;
const DEFAULT_ERROR_TYPE = "application_error";

function toNumber(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function trimString(value) {
  return String(value || "").trim();
}

function normalizePath(pathValue) {
  const normalized = trimString(pathValue) || "/";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function normalizeMethod(method) {
  return trimString(method).toUpperCase() || "GET";
}

function buildEndpoint(method, normalizedPath) {
  return `${normalizeMethod(method)} ${normalizePath(normalizedPath)}`;
}

function truncate(value, maxLength) {
  const text = String(value ?? "");
  if (!maxLength || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function redactValue(value, options = {}) {
  const maxStringLength = options.maxStringLength || 2000;

  if (value == null) return value;
  if (typeof value === "string") return truncate(value, maxStringLength);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 25).map((entry) => redactValue(entry, options));
  }
  if (Buffer.isBuffer(value)) {
    return `[buffer:${value.length}]`;
  }
  if (typeof value === "object") {
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = "[REDACTED]";
        continue;
      }
      result[key] = redactValue(entry, options);
    }
    return result;
  }

  return truncate(String(value), maxStringLength);
}

function sanitizeHeaders(headers, maxValueLength) {
  const result = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = "[REDACTED]";
      continue;
    }
    result[key] = truncate(Array.isArray(value) ? value.join(",") : value, maxValueLength);
  }
  return result;
}

function extractMessage(body, fallback) {
  if (body && typeof body === "object") {
    if (body.message) return trimString(body.message);
    if (body.error && typeof body.error === "string") return trimString(body.error);
    if (body.functionalMessage) return trimString(body.functionalMessage);
  }
  return trimString(fallback);
}

function extractErrorCode(body, fallback) {
  if (body && typeof body === "object") {
    if (body.errorCode) return trimString(body.errorCode);
    if (body.code) return trimString(body.code);
    if (typeof body.error === "string") return trimString(body.error);
  }
  return trimString(fallback);
}

function extractErrorType(body, fallback) {
  if (body && typeof body === "object") {
    if (body.errorType) return trimString(body.errorType);
    if (body.type) return trimString(body.type);
  }
  return trimString(fallback);
}

function buildFingerprint(serviceName, method, normalizedPath, statusCode, errorKey) {
  return [
    trimString(serviceName),
    normalizeMethod(method),
    normalizePath(normalizedPath),
    String(statusCode ?? ""),
    trimString(errorKey) || DEFAULT_ERROR_TYPE,
  ].join("::");
}

function buildResolutionKey(serviceName, method, normalizedPath) {
  return [
    trimString(serviceName),
    normalizeMethod(method),
    normalizePath(normalizedPath),
  ].join("::");
}

function buildFailureRecord(event) {
  return {
    responseCode: event.statusCode ?? null,
    responseHeaders: event.responseHeaders || {},
    responseBody: typeof event.responseBody === "string"
      ? event.responseBody
      : JSON.stringify(event.responseBody || {}),
    responseSummary: truncate(event.message || event.errorCode || event.errorType, 500),
    latency: event.latency ?? null,
    applicationEvent: {
      serviceName: event.serviceName,
      method: event.method,
      path: event.path,
      normalizedPath: event.normalizedPath,
      errorCode: event.errorCode,
      errorType: event.errorType,
      correlationId: event.correlationId,
      requestContext: event.requestContext,
      sourceTimestamp: event.sourceTimestamp,
    },
  };
}

function validateStatusCode(statusCode) {
  return Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599;
}

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function buildOccurredAt(timestamp) {
  const candidate = timestamp ? new Date(timestamp) : new Date();
  if (Number.isNaN(candidate.getTime())) {
    return new Date();
  }
  return candidate;
}

function normalizeRequestContext(requestContext, maxStringLength) {
  if (!requestContext || typeof requestContext !== "object") {
    return {};
  }

  return {
    headers: sanitizeHeaders(requestContext.headers || {}, maxStringLength),
    params: redactValue(requestContext.params || {}, { maxStringLength }),
    query: redactValue(requestContext.query || {}, { maxStringLength }),
    body: redactValue(requestContext.body, { maxStringLength }),
    ip: trimString(requestContext.ip),
    userAgent: truncate(requestContext.userAgent, maxStringLength),
  };
}

function createApplicationEventService({
  logger,
  incidentService,
  fourXxThresholdCount,
  fourXxThresholdWindowMs,
  reopenCooldownMs,
  payloadStringMaxLength,
  headerValueMaxLength,
}) {
  async function resolveNormalizedPath(payload) {
    const normalizedPath = trimString(payload.normalizedPath);
    if (normalizedPath) {
      return normalizePath(normalizedPath);
    }

    const requestPath = normalizePath(payload.path);
    const discovered = await DiscoveredRoute.findOne({
      serviceName: trimString(payload.serviceName),
      method: normalizeMethod(payload.method),
      path: requestPath,
    }).lean();

    return discovered?.path || requestPath;
  }

  async function normalizeFailureEvent(payload) {
    const serviceName = trimString(payload.serviceName);
    const method = normalizeMethod(payload.method);
    const path = normalizePath(payload.path);
    if (!serviceName) throw validationError("serviceName is required");
    if (!trimString(payload.method)) throw validationError("method is required");
    if (!trimString(payload.path)) throw validationError("path is required");
    if (!validateStatusCode(payload.statusCode)) throw validationError("statusCode is required");

    const normalizedPath = await resolveNormalizedPath(payload);
    const responseBody = redactValue(payload.responseBody, {
      maxStringLength: payloadStringMaxLength,
    });
    const errorCode = extractErrorCode(responseBody, payload.errorCode);
    const statusCode = toNumber(payload.statusCode, null);
    const errorType = extractErrorType(responseBody, payload.errorType)
      || (statusCode >= 500 ? DEFAULT_ERROR_TYPE : "client_error");
    const message = extractMessage(responseBody, payload.message);

    return {
      eventType: "failure",
      serviceName,
      baseUrl: trimString(payload.baseUrl),
      method,
      path,
      normalizedPath,
      endpoint: buildEndpoint(method, normalizedPath),
      resolutionKey: buildResolutionKey(serviceName, method, normalizedPath),
      fingerprint: buildFingerprint(serviceName, method, normalizedPath, statusCode, errorCode || errorType),
      statusCode,
      errorCode,
      errorType,
      message: truncate(message, payloadStringMaxLength),
      responseBody,
      responseHeaders: sanitizeHeaders(payload.responseHeaders || {}, headerValueMaxLength),
      latency: toNumber(payload.latency, null),
      requestContext: normalizeRequestContext(payload.requestContext, payloadStringMaxLength),
      correlationId: trimString(payload.correlationId),
      sourceTimestamp: buildOccurredAt(payload.timestamp),
    };
  }

  async function normalizeSuccessEvent(payload) {
    const serviceName = trimString(payload.serviceName);
    const method = normalizeMethod(payload.method);
    const path = normalizePath(payload.path);
    if (!serviceName) throw validationError("serviceName is required");
    if (!trimString(payload.method)) throw validationError("method is required");
    if (!trimString(payload.path)) throw validationError("path is required");
    if (!validateStatusCode(payload.statusCode)) throw validationError("statusCode is required");

    const normalizedPath = await resolveNormalizedPath(payload);
    return {
      eventType: "success",
      serviceName,
      baseUrl: trimString(payload.baseUrl),
      method,
      path,
      normalizedPath,
      endpoint: buildEndpoint(method, normalizedPath),
      resolutionKey: buildResolutionKey(serviceName, method, normalizedPath),
      fingerprint: "",
      statusCode: toNumber(payload.statusCode, null),
      errorCode: "",
      errorType: "",
      message: truncate(trimString(payload.message) || "success", payloadStringMaxLength),
      responseBody: null,
      responseHeaders: {},
      latency: toNumber(payload.latency, null),
      requestContext: normalizeRequestContext(payload.requestContext, payloadStringMaxLength),
      correlationId: trimString(payload.correlationId),
      sourceTimestamp: buildOccurredAt(payload.timestamp),
    };
  }

  async function persistEvent(event, extras = {}) {
    return ApplicationEvent.create({
      ...event,
      ...extras,
    });
  }

  async function shouldSuppressReopen(fingerprint) {
    if (!reopenCooldownMs) return false;
    const cutoff = new Date(Date.now() - reopenCooldownMs);
    const recent = await Incident.findOne({
      incidentType: "application_failure",
      fingerprint,
      status: "RESOLVED",
      resolvedAt: { $gte: cutoff },
    }).sort({ resolvedAt: -1 });

    return Boolean(recent);
  }

  function isImmediateIncident(event) {
    if (event.statusCode >= 500) return true;
    return /(application_exception|application_error|internal_server_error)/i.test(
      `${event.errorType} ${event.errorCode}`,
    );
  }

  async function hasThresholdBreach(event) {
    const windowStart = new Date(event.sourceTimestamp.getTime() - fourXxThresholdWindowMs);
    const count = await ApplicationEvent.countDocuments({
      eventType: "failure",
      fingerprint: event.fingerprint,
      sourceTimestamp: { $gte: windowStart },
    });
    return count >= fourXxThresholdCount;
  }

  async function resolveServiceDoc(event) {
    const registered = await Service.findOne({ serviceName: event.serviceName }).lean();
    if (registered) return registered;
    if (!event.baseUrl) return null;
    return {
      serviceName: event.serviceName,
      baseUrl: event.baseUrl,
      dependencies: [],
    };
  }

  async function ingestFailureEvent(payload) {
    const event = await normalizeFailureEvent(payload);
    const immediate = isImmediateIncident(event);

    const eventDoc = await persistEvent(event);

    let thresholdBreached = false;
    if (!immediate && event.statusCode >= 400 && event.statusCode < 500) {
      thresholdBreached = await hasThresholdBreach(event);
      if (thresholdBreached) {
        await ApplicationEvent.updateOne(
          { _id: eventDoc._id },
          { $set: { thresholdBreached: true } },
        );
      }
    }

    const shouldOpenIncident = immediate || thresholdBreached;
    if (!shouldOpenIncident) {
      logger.info("application_event.recorded", {
        serviceName: event.serviceName,
        endpoint: event.endpoint,
        statusCode: event.statusCode,
        alert: false,
      });
      return {
        accepted: true,
        incidentOpened: false,
        thresholdBreached: false,
      };
    }

    if (await shouldSuppressReopen(event.fingerprint)) {
      logger.warn("application_event.reopen_suppressed", {
        serviceName: event.serviceName,
        fingerprint: event.fingerprint,
      });
      return {
        accepted: true,
        incidentOpened: false,
        thresholdBreached,
        suppressed: true,
      };
    }

    const serviceDoc = await resolveServiceDoc(event);
    const incident = await incidentService.openIncident({
      serviceName: event.serviceName,
      endpoint: event.endpoint,
      critical: event.statusCode >= 500,
      failure: buildFailureRecord(event),
      retryAttempts: 0,
      serviceDoc,
      incidentType: "application_failure",
      fingerprint: event.fingerprint,
      resolutionKey: event.resolutionKey,
    });

    await ApplicationEvent.updateOne(
      { _id: eventDoc._id },
      { $set: { incidentId: incident.incidentId, thresholdBreached } },
    );

    return {
      accepted: true,
      incidentOpened: incident.status === "OPEN",
      thresholdBreached,
      incidentId: incident.incidentId,
    };
  }

  async function ingestSuccessEvent(payload) {
    const event = await normalizeSuccessEvent(payload);
    await persistEvent(event);

    const resolvedIncidents = await incidentService.resolveApplicationIncidents({
      serviceName: event.serviceName,
      resolutionKey: event.resolutionKey,
    });

    return {
      accepted: true,
      resolvedCount: resolvedIncidents.length,
    };
  }

  return {
    ingestFailureEvent,
    ingestSuccessEvent,
  };
}

module.exports = { createApplicationEventService };
