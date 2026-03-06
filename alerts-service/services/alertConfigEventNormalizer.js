const crypto = require('crypto');
const { getBrandById } = require('../config/brands');

const SUPPORTED_EVENT_TYPES = new Set([
  'alert.config.created',
  'alert.config.updated',
  'alert.config.deleted',
]);

function toPlainAlert(alert) {
  if (!alert) return null;
  if (typeof alert.toJSON === 'function') return alert.toJSON();
  if (typeof alert.toObject === 'function') return alert.toObject();
  return alert;
}

function toIsoString(value, fallbackDate = new Date()) {
  if (!value) return fallbackDate.toISOString();
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return fallbackDate.toISOString();
  return dt.toISOString();
}

function toFallbackDate(value) {
  if (value instanceof Date) return value;
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? new Date() : dt;
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toSnakeCase(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function deriveScope(alert) {
  const raw = toSnakeCase(alert.scope);
  if (raw === 'single' || raw === 'multiple' || raw === 'global') return raw;
  return 'single';
}

function deriveAlertType(alert) {
  const explicit = toSnakeCase(alert.alert_type || alert.alertType);
  if (explicit) return explicit;

  const metric = toSnakeCase(alert.metric_name || alert.metricName);
  const thresholdType = toSnakeCase(alert.threshold_type || alert.thresholdType);

  // Temporary deterministic fallback for publisher/subscriber contract testing.
  if (metric && thresholdType) {
    if (thresholdType.includes('below')) return `${metric}_drop`;
    if (thresholdType.includes('above')) return `${metric}_increase`;
    return `${metric}_${thresholdType}`;
  }

  if (metric) return `${metric}_alert`;
  return 'generic_alert';
}

function deriveVersion(alert, fallbackDate) {
  const explicit = Number(alert.version);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);

  const candidates = [alert.updated_at, alert.created_at, fallbackDate];
  for (const candidate of candidates) {
    const dt = candidate instanceof Date ? candidate : new Date(candidate);
    const ms = dt.getTime();
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return Date.now();
}

function normalizeAlertConfigEvent({
  eventType,
  alert,
  source = 'alerts-api',
  schemaVersion = '1',
  occurredAt = new Date(),
  traceId,
  correlationId,
}) {
  if (!SUPPORTED_EVENT_TYPES.has(eventType)) {
    throw new Error(`Unsupported alert config eventType: ${eventType}`);
  }

  const src = toPlainAlert(alert);
  if (!src) throw new Error('alert row is required');

  const alertId = Number(src.id);
  if (!Number.isFinite(alertId)) {
    throw new Error('alert.id must be a finite number for config events');
  }

  const brandId = Number(src.brand_id);
  if (!Number.isFinite(brandId)) {
    throw new Error(`alert.brand_id must be a finite number for alert ${alertId}`);
  }

  const brandMeta = getBrandById(brandId);
  if (!brandMeta || !brandMeta.key) {
    throw new Error(`Missing tenantId mapping for brand_id=${brandId} (alertId=${alertId})`);
  }

  const occurredAtIso = toIsoString(occurredAt);
  const payloadUpdatedAt = toIsoString(
    src.updated_at || src.created_at,
    toFallbackDate(occurredAtIso),
  );
  const version = deriveVersion(src, occurredAtIso);
  const suffix = eventType.split('.').pop();
  const isActive = Boolean(Number(src.is_active));

  const event = {
    eventId: typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    eventType,
    occurredAt: occurredAtIso,
    source,
    idempotencyKey: `alert-config:${alertId}:v${version}:${suffix}`,
    tenantId: brandMeta.key,
    brandId,
    alertId,
    schemaVersion: String(schemaVersion),
    payload: {
      name: src.name || null,
      alertName: src.name || null,
      alertType: deriveAlertType(src),
      scope: deriveScope(src),
      status: isActive ? 'active' : 'inactive',
      isActive,
      metricName: src.metric_name || null,
      metricType: src.metric_type || null,
      thresholdType: src.threshold_type || null,
      thresholdValue: toNullableNumber(src.threshold_value),
      criticalThreshold: toNullableNumber(src.critical_threshold),
      severity: src.severity || null,
      cooldownMinutes: toNullableNumber(src.cooldown_minutes),
      updatedAt: payloadUpdatedAt,
      version,
    },
  };

  if (traceId) event.traceId = String(traceId);
  if (correlationId) event.correlationId = String(correlationId);

  return event;
}

module.exports = {
  SUPPORTED_EVENT_TYPES,
  deriveAlertType,
  normalizeAlertConfigEvent,
};
