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

  const service = createNotificationAuditService();
  await service.recordAttempt({
    incidentId: "incident-1",
    recipients: ["ops@example.com"],
    subject: "Subject",
    status: "FAILED",
    error: "smtp down",
  });

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].status, "FAILED");
  assert.equal(recorded[0].error, "smtp down");
});
