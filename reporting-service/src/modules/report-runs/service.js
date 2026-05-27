const ReportRun = require("../../models/reportRun.model");
const ReportDefinition = require("../../models/reportDefinition.model");
const { notFound, HttpError } = require("../../utils/errors");
const { finalizeDispatch, writeEvent } = require("../generation/reportGenerator.service");

async function listRuns(tenantId) {
  return ReportRun.find({ tenant_id: tenantId }).sort({ created_at: -1 }).limit(100).lean();
}

async function getRun(tenantId, id) {
  const run = await ReportRun.findOne({ _id: id, tenant_id: tenantId }).lean();
  if (!run) throw notFound("report_run_not_found");
  return run;
}

async function loadDefinitionForRun(run) {
  const definition = await ReportDefinition.findOne({ _id: run.report_definition_id, tenant_id: run.tenant_id }).lean();
  if (!definition) throw notFound("report_definition_not_found");
  return definition;
}

async function approveRun(tenantId, user, id) {
  const run = await ReportRun.findOne({ _id: id, tenant_id: tenantId });
  if (!run) throw notFound("report_run_not_found");
  if (run.status !== "pending_approval") throw new HttpError(409, "report_not_pending_approval");
  run.status = "approved";
  run.approval.status = "approved";
  run.approval.decided_at = new Date();
  run.approval.decided_by = user.id;
  run.approval.token_hash = null;
  await run.save();
  await writeEvent({ tenantId, runId: run._id, type: "approved", actorType: "author", actorId: user.id });
  return finalizeDispatch({ definition: await loadDefinitionForRun(run), run });
}

async function rejectRun(tenantId, user, id, reason = "") {
  const run = await ReportRun.findOne({ _id: id, tenant_id: tenantId });
  if (!run) throw notFound("report_run_not_found");
  if (run.status !== "pending_approval") throw new HttpError(409, "report_not_pending_approval");
  run.status = "rejected";
  run.approval.status = "rejected";
  run.approval.decided_at = new Date();
  run.approval.decided_by = user.id;
  run.approval.rejection_reason = reason;
  run.approval.token_hash = null;
  await run.save();
  await writeEvent({ tenantId, runId: run._id, type: "rejected", actorType: "author", actorId: user.id, payload: { reason } });
  return run;
}

async function resendRun(tenantId, id) {
  const run = await ReportRun.findOne({ _id: id, tenant_id: tenantId });
  if (!run) throw notFound("report_run_not_found");
  if (!["sent", "failed"].includes(run.status)) throw new HttpError(409, "report_cannot_be_resent");
  return finalizeDispatch({ definition: await loadDefinitionForRun(run), run });
}

module.exports = { listRuns, getRun, approveRun, rejectRun, resendRun };
