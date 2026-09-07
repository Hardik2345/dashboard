const logger = require('../utils/logger');

function isTruthyEnv(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function toPositiveInt(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.floor(num) : fallback;
}

function toBaseUrl(raw) {
  const value = String(raw || '').trim();
  return value.replace(/\/+$/, '');
}

function shouldRetryStatus(status) {
  return status === 429 || status >= 500;
}

function toErrorDetails(err) {
  if (!err) return null;

  const details = {
    name: err.name,
    message: err.message,
    code: err.code,
    statusCode: err.statusCode,
    stack: err.stack,
  };

  if (err.cause) {
    details.cause = {
      name: err.cause.name,
      message: err.cause.message,
      code: err.cause.code,
      stack: err.cause.stack,
    };
  }

  return details;
}

function buildDslConfigEventBridge(options = {}) {
  const log = options.logger || logger;
  const enabled = options.enabled != null
    ? Boolean(options.enabled)
    : isTruthyEnv(process.env.DSL_CONFIG_FANOUT_ENABLED);
  const baseUrl = toBaseUrl(options.baseUrl || process.env.DSL_ENGINE_BASE_URL);
  const token = String(options.token || process.env.DSL_INGEST_TOKEN || '').trim();
  const timeoutMs = toPositiveInt(
    options.timeoutMs ?? process.env.DSL_CONFIG_FANOUT_TIMEOUT_MS,
    3000,
  );
  const retryCount = toPositiveInt(
    options.retryCount ?? process.env.DSL_CONFIG_FANOUT_RETRY_COUNT,
    2,
  );
  const backoffMs = toPositiveInt(
    options.backoffMs ?? process.env.DSL_CONFIG_FANOUT_RETRY_BACKOFF_MS,
    250,
  );
  const verboseErrors = options.verboseErrors != null
    ? Boolean(options.verboseErrors)
    : isTruthyEnv(process.env.DSL_CONFIG_FANOUT_VERBOSE_ERRORS);
  const fetchImpl = options.fetch || globalThis.fetch;

  if (enabled && !baseUrl) {
    throw new Error('DSL_ENGINE_BASE_URL is required when DSL_CONFIG_FANOUT_ENABLED is true');
  }
  if (enabled && typeof fetchImpl !== 'function') {
    throw new Error('Global fetch is unavailable; provide fetch implementation for DSL fan-out');
  }

  async function sleep(ms) {
    if (!ms) return;
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function sendConfigEventToDsl(envelope) {
    if (!enabled) {
      return { skipped: true, reason: 'disabled' };
    }

    const tenantId = envelope?.tenantId;
    if (!tenantId) {
      throw new Error('tenantId is required in envelope for DSL fan-out');
    }

    const targetUrl = `${baseUrl}/tenants/${encodeURIComponent(String(tenantId))}/alerts/config-events`;
    const maxAttempts = retryCount + 1;
    const baseLog = {
      eventType: envelope?.eventType,
      tenantId: envelope?.tenantId,
      alertId: envelope?.alertId,
      eventId: envelope?.eventId,
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      log.info('[alerts-events] dsl_fanout_attempt', { ...baseLog, attempt, maxAttempts });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      try {
        const response = await fetchImpl(targetUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(envelope),
          signal: controller.signal,
        });

        clearTimeout(timeout);
        if (response.status >= 200 && response.status < 300) {
          log.info('[alerts-events] dsl_fanout_success', { ...baseLog, statusCode: response.status, attempt });
          return { statusCode: response.status };
        }

        const retryable = shouldRetryStatus(response.status);
        const failureLog = {
          ...baseLog,
          statusCode: response.status,
          category: retryable ? 'http_transient' : 'http_permanent',
          attempt,
          maxAttempts,
        };
        log.warn('[alerts-events] dsl_fanout_failure', failureLog);

        if (!retryable || attempt >= maxAttempts) {
          const err = new Error(`DSL fan-out failed with status ${response.status}`);
          err.statusCode = response.status;
          err.retryable = retryable;
          throw err;
        }
      } catch (err) {
        clearTimeout(timeout);
        const isAbort = err?.name === 'AbortError';
        const retryable = isAbort || !('statusCode' in err);
        const failureLog = {
          ...baseLog,
          category: isAbort ? 'timeout' : (retryable ? 'network' : 'http_permanent'),
          error: err.message,
          statusCode: err.statusCode,
          attempt,
          maxAttempts,
        };
        if (verboseErrors) {
          failureLog.errorDetails = toErrorDetails(err);
        }
        log.warn('[alerts-events] dsl_fanout_failure', failureLog);

        if (!retryable || attempt >= maxAttempts) {
          throw err;
        }
      }

      const delay = backoffMs * attempt;
      await sleep(delay);
    }

    throw new Error('DSL fan-out failed unexpectedly');
  }

  return {
    sendConfigEventToDsl,
    isEnabled: () => enabled,
  };
}

module.exports = {
  buildDslConfigEventBridge,
};
