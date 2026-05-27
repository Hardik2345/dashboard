const { env } = require("../../config/env");
const { sendEmail } = require("../dispatch/emailClient");

async function sendApprovalEmail({ definition, run, token }) {
  const approvers = definition.approval?.approver_emails || [];
  const url = `${env.REPORTING_PUBLIC_BASE_URL}/report-approval/${token}`;
  return sendEmail({
    to: approvers,
    subject: `Approval needed: ${definition.name} ${run.period.label}`,
    html: `<p>A report is ready for approval.</p><p><a href="${url}">Review and approve report</a></p>`,
  });
}

module.exports = { sendApprovalEmail };
