const nodemailer = require("nodemailer");
const { env } = require("../../config/env");
const logger = require("../../utils/logger");

let transporter;

function getTransporter() {
  if (!env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

async function sendEmail({ to, cc, bcc, subject, html }) {
  const active = getTransporter();
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (!active) {
    logger.warn("[reporting-service] SMTP_HOST not configured; email skipped", { subject, recipients });
    return { skipped: true, messageId: "smtp-not-configured" };
  }
  const info = await active.sendMail({
    from: env.SMTP_FROM,
    to: recipients,
    cc,
    bcc,
    subject,
    html,
  });
  return { skipped: false, messageId: info.messageId };
}

module.exports = { sendEmail };
