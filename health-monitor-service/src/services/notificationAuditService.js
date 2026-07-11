const Notification = require("../models/Notification");

function createNotificationAuditService() {
  async function recordAttempt({ incidentId, recipients, subject, status, error = "" }) {
    await Notification.create({
      incidentId,
      recipients: Array.isArray(recipients) ? recipients : [],
      subject,
      status,
      error,
      sentAt: new Date(),
    });
  }

  return {
    recordAttempt,
  };
}

module.exports = { createNotificationAuditService };
