const nodemailer = require("nodemailer");
const { buildOpenEmail, buildResolvedEmail } = require("./emailTemplates");

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

  async function sendMail(message, meta = {}) {
    const recipients = smtp.recipients;
    const fullSubject = `${smtp.subjectPrefix} ${message.subject}`.trim();
    if (!enabled || !transport) {
      logger.warn("email.skipped", { reason: "smtp_not_configured", ...meta });
      await notificationAuditService.recordAttempt({
        incidentId: meta.incidentId,
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
        recipients,
        subject: fullSubject,
        status: "SENT",
      });
      logger.info("email.sent", { subject: message.subject, ...meta });
      return true;
    } catch (error) {
      await notificationAuditService.recordAttempt({
        incidentId: meta.incidentId,
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
    return sendMail(buildOpenEmail({ incident, failure, enrichment }), {
      incidentId: incident.incidentId,
      event: "open",
    });
  }

  async function sendIncidentResolved(incident) {
    return sendMail(buildResolvedEmail(incident), {
      incidentId: incident.incidentId,
      event: "resolve",
    });
  }

  return {
    sendIncidentOpened,
    sendIncidentResolved,
  };
}

module.exports = { createEmailService };
