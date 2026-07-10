const test = require("node:test");
const assert = require("node:assert/strict");
const nodemailer = require("nodemailer");

const { createEmailService } = require("../src/services/emailService");

function buildLogger() {
  return {
    info() {},
    warn() {},
    error() {},
  };
}

test("email service records successful notification attempts", async () => {
  const sent = [];
  const original = nodemailer.createTransport;
  nodemailer.createTransport = () => ({
    async sendMail(payload) {
      sent.push(payload);
    },
  });

  const attempts = [];
  const service = createEmailService({
    logger: buildLogger(),
    smtp: {
      host: "smtp.gmail.com",
      port: 587,
      user: "alerts@example.com",
      pass: "secret",
      recipients: ["ops@example.com"],
      subjectPrefix: "[Datum Health]",
    },
    notificationAuditService: {
      async recordAttempt(payload) {
        attempts.push(payload);
      },
    },
  });

  await service.sendIncidentResolved({
    incidentId: "incident-1",
    service: "alerts-service",
    endpoint: "GET /health/monitor",
    startedAt: new Date("2026-01-01T00:00:00.000Z"),
    resolvedAt: new Date("2026-01-01T00:10:00.000Z"),
    duration: 600000,
    totalRetries: 2,
  });

  nodemailer.createTransport = original;

  assert.equal(sent.length, 1);
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].status, "SENT");
  assert.equal(sent[0].text.includes("Notification History"), false);
});
