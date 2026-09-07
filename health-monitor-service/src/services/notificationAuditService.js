const Notification = require("../models/Notification");

function createNotificationAuditService() {
  async function recordAttempt({
    incidentId,
    alertKey = "",
    event = "",
    recipients,
    subject,
    status,
    error = "",
  }) {
    await Notification.create({
      incidentId,
      alertKey,
      event,
      recipients: Array.isArray(recipients) ? recipients : [],
      subject,
      status,
      error,
      sentAt: new Date(),
    });
  }

  async function wasRecentOpenAlertSent({ alertKey, withinMs }) {
    if (!alertKey || !withinMs) {
      return false;
    }

    const cutoff = new Date(Date.now() - withinMs);
    const recent = await Notification.findOne({
      alertKey,
      event: "open",
      status: "SENT",
      sentAt: { $gte: cutoff },
    })
      .sort({ sentAt: -1 })
      .lean();

    return Boolean(recent);
  }

  return {
    recordAttempt,
    wasRecentOpenAlertSent,
  };
}

module.exports = { createNotificationAuditService };
