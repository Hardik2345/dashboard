const ReportRun = require("../../models/reportRun.model");
const ReportDefinition = require("../../models/reportDefinition.model");
const { HttpError, notFound } = require("../../utils/errors");
const { hashApprovalToken } = require("./approvalToken.service");
const { renderApprovalPage } = require("../rendering/renderer");
const { finalizeDispatch, writeEvent } = require("../generation/reportGenerator.service");

async function findRunByToken(token) {
  const tokenHash = hashApprovalToken(token);
  const run = await ReportRun.findOne({ "approval.token_hash": tokenHash });
  if (!run) throw notFound("approval_token_not_found");
  if (run.approval?.expires_at && run.approval.expires_at < new Date()) {
    run.status = "expired";
    run.approval.status = "expired";
    run.approval.token_hash = null;
    await run.save();
    await writeEvent({ tenantId: run.tenant_id, runId: run._id, type: "expired" });
    throw new HttpError(410, "approval_token_expired");
  }
  return run;
}

async function renderTokenPreview(token) {
  const run = await findRunByToken(token);
  return renderApprovalPage(run.toObject(), token);
}

async function approveByToken(token) {
  const run = await findRunByToken(token);
  if (run.status !== "pending_approval") throw new HttpError(409, "report_not_pending_approval");
  const definition = await ReportDefinition.findOne({ _id: run.report_definition_id, tenant_id: run.tenant_id }).lean();
  if (!definition) throw notFound("report_definition_not_found");
  run.status = "approved";
  run.approval.status = "approved";
  run.approval.decided_at = new Date();
  run.approval.decided_by = "approval-link";
  run.approval.token_hash = null;
  await run.save();
  await writeEvent({ tenantId: run.tenant_id, runId: run._id, type: "approved", actorType: "author", actorId: "approval-link" });
  return finalizeDispatch({ definition, run });
}

async function rejectByToken(token, reason = "") {
  const run = await findRunByToken(token);
  if (run.status !== "pending_approval") throw new HttpError(409, "report_not_pending_approval");
  run.status = "rejected";
  run.approval.status = "rejected";
  run.approval.decided_at = new Date();
  run.approval.decided_by = "approval-link";
  run.approval.rejection_reason = reason;
  run.approval.token_hash = null;
  await run.save();
  await writeEvent({ tenantId: run.tenant_id, runId: run._id, type: "rejected", actorType: "author", actorId: "approval-link", payload: { reason } });
  return run;
}

module.exports = { renderTokenPreview, approveByToken, rejectByToken };
