const test = require("node:test");
const assert = require("node:assert/strict");

const Notification = require("../src/models/Notification");
const { createNotificationAuditService } = require("../src/services/notificationAuditService");

test("notification audit service records email attempts", async () => {
  const recorded = [];
  Notification.create = async (doc) => {
    recorded.push(doc);
    return doc;
  };
  Notification.findOne = () => ({
    sort() {
      return this;
    },
    lean: async () => null,
  });

  const service = createNotificationAuditService();
  await service.recordAttempt({
    incidentId: "incident-1",
    alertKey: "health_check::tenant-router::GET /health",
    event: "open",
    recipients: ["ops@example.com"],
    subject: "Subject",
    status: "FAILED",
    error: "smtp down",
  });

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].alertKey, "health_check::tenant-router::GET /health");
  assert.equal(recorded[0].event, "open");
  assert.equal(recorded[0].status, "FAILED");
  assert.equal(recorded[0].error, "smtp down");
});

test("notification audit service detects a recently sent open alert", async () => {
  Notification.findOne = () => ({
    sort() {
      return this;
    },
    lean: async () => ({ _id: "notification-1" }),
  });

  const service = createNotificationAuditService();
  const recent = await service.wasRecentOpenAlertSent({
    alertKey: "health_check::tenant-router::GET /health",
    withinMs: 30 * 60 * 1000,
  });

  assert.equal(recent, true);
});
