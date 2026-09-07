const nodemailer = require("nodemailer");
const { buildOpenEmail, buildResolvedEmail } = require("./emailTemplates");

function buildAlertKey(incident) {
  if (!incident) return "";
  if (incident.incidentType === "application_failure") {
    return [
      incident.incidentType,
      incident.service,
      incident.resolutionKey || incident.endpoint,
      incident.fingerprint || "",
    ].join("::");
  }

  return [
    incident.incidentType || "health_check",
    incident.service,
    incident.endpoint,
  ].join("::");
}

function createEmailService({
  logger,
  smtp,
  notificationAuditService,
  openIncidentEmailReminderIntervalMs = 30 * 60 * 1000,
}) {
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

  async function sendMail(message, meta = {}) {
    const recipients = smtp.recipients;
    const fullSubject = `${smtp.subjectPrefix} ${message.subject}`.trim();
    if (!enabled || !transport) {
      logger.warn("email.skipped", { reason: "smtp_not_configured", ...meta });
      await notificationAuditService.recordAttempt({
        incidentId: meta.incidentId,
        alertKey: meta.alertKey,
        event: meta.event,
        recipients,
        subject: fullSubject,
        status: "SKIPPED",
        error: "smtp_not_configured",
      });
      return false;
    }

    try {
      await transport.sendMail({
        from: smtp.user,
        to: recipients.join(","),
        subject: fullSubject,
        text: message.text,
        html: message.html,
      });
      await notificationAuditService.recordAttempt({
        incidentId: meta.incidentId,
        alertKey: meta.alertKey,
        event: meta.event,
        recipients,
        subject: fullSubject,
        status: "SENT",
      });
      logger.info("email.sent", { subject: message.subject, ...meta });
      return true;
    } catch (error) {
      await notificationAuditService.recordAttempt({
        incidentId: meta.incidentId,
        alertKey: meta.alertKey,
        event: meta.event,
        recipients,
        subject: fullSubject,
        status: "FAILED",
        error: error.message,
      });
      logger.error("email.failed", {
        subject: message.subject,
        error: error.message,
        ...meta,
      });
      return false;
    }
  }

  async function sendIncidentOpened({ incident, failure, enrichment }) {
    const alertKey = buildAlertKey(incident);
    const message = buildOpenEmail({ incident, failure, enrichment });
    const recentlySent = await notificationAuditService.wasRecentOpenAlertSent({
      alertKey,
      withinMs: openIncidentEmailReminderIntervalMs,
    });

    if (recentlySent) {
      logger.warn("email.open_throttled", {
        incidentId: incident.incidentId,
        alertKey,
      });
      await notificationAuditService.recordAttempt({
        incidentId: incident.incidentId,
        alertKey,
        event: "open",
        recipients: smtp.recipients,
        subject: `${smtp.subjectPrefix} ${message.subject}`.trim(),
        status: "SKIPPED",
        error: "open_alert_throttled",
      });
      return false;
    }

    return sendMail(message, {
      incidentId: incident.incidentId,
      alertKey,
      event: "open",
    });
  }

  async function sendIncidentResolved(incident) {
    return sendMail(buildResolvedEmail(incident), {
      incidentId: incident.incidentId,
      alertKey: buildAlertKey(incident),
      event: "resolve",
    });
  }

  return {
    sendIncidentOpened,
    sendIncidentResolved,
  };
}

module.exports = { createEmailService };
