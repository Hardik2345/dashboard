// Allowlist projection — never expose Mongo internals or raw failure payloads
// (lastFailure/dependencySummary/lastProbeStatus may carry response bodies,
// headers, or other application internals captured for email/enrichment).
function sanitizeIncident(doc) {
  if (!doc) return null;
  return {
    incidentId: doc.incidentId,
    service: doc.service,
    endpoint: doc.endpoint,
    incidentType: doc.incidentType,
    severity: doc.severity,
    status: doc.status,
    startedAt: doc.startedAt,
    resolvedAt: doc.resolvedAt,
    duration: doc.duration,
    failureCount: doc.failureCount,
    totalRetries: doc.totalRetries,
    lastProbeMessage: doc.lastProbeMessage || "",
  };
}

module.exports = { sanitizeIncident };
