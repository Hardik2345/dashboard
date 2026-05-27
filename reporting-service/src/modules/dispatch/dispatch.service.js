const { sendEmail } = require("./emailClient");

function countRecipients(recipients = {}) {
  return ["to", "cc", "bcc"].reduce((sum, key) => sum + (recipients[key] || []).filter(Boolean).length, 0);
}

async function dispatchReport({ definition, run }) {
  const recipients = definition.recipients || {};
  const result = await sendEmail({
    to: recipients.to || [],
    cc: recipients.cc || [],
    bcc: recipients.bcc || [],
    subject: `${definition.name || "Digest"}: ${run.period.label}`,
    html: run.snapshot.html,
  });
  return {
    provider: "smtp",
    message_id: result.messageId,
    sent_at: new Date(),
    recipients_count: countRecipients(recipients),
  };
}

module.exports = { dispatchReport };
