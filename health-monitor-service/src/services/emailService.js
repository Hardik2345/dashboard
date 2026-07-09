const nodemailer = require("nodemailer");

function formatDependencyLines(dependencyPayload) {
  const entries = Object.entries(dependencyPayload || {});
  if (!entries.length) {
    return ["Dependency Status: N/A"];
  }

  return [
    "Dependency Status:",
    ...entries.map(([dependency, details]) => {
      const status = details?.status || details || "UNKNOWN";
      const message = details?.message ? ` (${details.message})` : "";
      return `- ${dependency}: ${status}${message}`;
    }),
  ];
}

function createEmailService({ logger, smtp, notificationAuditService }) {
  const enabled = Boolean(
    smtp.host && smtp.port && smtp.user && smtp.pass && smtp.recipients.length > 0,
  );

  const transport = enabled
    ? nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: false,
        auth: {
          user: smtp.user,
          pass: smtp.pass,
        },
      })
    : null;

  async function sendMail(subject, lines, meta = {}) {
    const recipients = smtp.recipients;
    if (!enabled || !transport) {
      logger.warn("email.skipped", { reason: "smtp_not_configured", ...meta });
      await notificationAuditService.recordAttempt({
        incidentId: meta.incidentId,
        recipients,
        subject: `${smtp.subjectPrefix} ${subject}`,
        status: "SKIPPED",
        error: "smtp_not_configured",
      });
      return false;
    }

    try {
      await transport.sendMail({
        from: smtp.user,
        to: recipients.join(","),
        subject: `${smtp.subjectPrefix} ${subject}`,
        text: lines.join("\n"),
      });
      await notificationAuditService.recordAttempt({
        incidentId: meta.incidentId,
        recipients,
        subject: `${smtp.subjectPrefix} ${subject}`,
        status: "SENT",
      });
      logger.info("email.sent", { subject, ...meta });
      return true;
    } catch (error) {
      await notificationAuditService.recordAttempt({
        incidentId: meta.incidentId,
        recipients,
        subject: `${smtp.subjectPrefix} ${subject}`,
        status: "FAILED",
        error: error.message,
      });
      logger.error("email.failed", {
        subject,
        error: error.message,
        ...meta,
      });
      return false;
    }
  }

  async function sendIncidentOpened({ incident, failure, enrichment }) {
    return sendMail(
      `Incident Open - ${incident.service} ${incident.endpoint}`,
      [
        `Incident ID: ${incident.incidentId}`,
        `Service: ${incident.service}`,
        `Endpoint: ${incident.endpoint}`,
        `Severity: ${incident.severity}`,
        `Started At: ${incident.startedAt.toISOString()}`,
        `HTTP Status: ${failure.responseCode ?? "N/A"}`,
        `Response Summary: ${failure.responseSummary || "N/A"}`,
        `Health Probe Status: ${enrichment?.healthProbe?.status ?? "N/A"}`,
        `Health Probe Summary: ${incident.lastProbeMessage || "N/A"}`,
        ...formatDependencyLines(enrichment?.dependencyPayload),
        `Recent Logs:`,
        enrichment?.logs || "N/A",
        `Incident Reference: ${incident.incidentId}`,
      ],
      { incidentId: incident.incidentId, event: "open" },
    );
  }

  async function sendIncidentResolved(incident) {
    return sendMail(
      `Incident Resolved - ${incident.service} ${incident.endpoint}`,
      [
        `Incident ID: ${incident.incidentId}`,
        `Service: ${incident.service}`,
        `Endpoint: ${incident.endpoint}`,
        `Started At: ${incident.startedAt.toISOString()}`,
        `Recovered At: ${incident.resolvedAt?.toISOString() || "N/A"}`,
        `Downtime (ms): ${incident.duration ?? 0}`,
        `Total Retries: ${incident.totalRetries ?? 0}`,
      ],
      { incidentId: incident.incidentId, event: "resolve" },
    );
  }

  return {
    sendIncidentOpened,
    sendIncidentResolved,
  };
}

module.exports = { createEmailService };
