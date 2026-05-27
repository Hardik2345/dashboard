const cron = require("node-cron");
const ReportDefinition = require("../../models/reportDefinition.model");
const { HttpError, notFound } = require("../../utils/errors");
const { buildKpiDefaults } = require("../generation/kpiRegistry");
const { runReportNow, previewReport } = require("../generation/reportGenerator.service");

function assertSchedule(definition) {
  if (definition.schedule?.enabled && !cron.validate(definition.schedule.cron)) {
    throw new HttpError(400, "invalid_cron");
  }
}

function withDefaults(input) {
  return {
    ...input,
    kpis: input.kpis?.length ? input.kpis : buildKpiDefaults(),
  };
}

async function listDefinitions(tenantId) {
  return ReportDefinition.find({ tenant_id: tenantId, status: { $ne: "archived" } }).sort({ created_at: -1 }).lean();
}

async function getDefinition(tenantId, id) {
  const definition = await ReportDefinition.findOne({ _id: id, tenant_id: tenantId }).lean();
  if (!definition) throw notFound("report_definition_not_found");
  return definition;
}

async function createDefinition(tenantId, user, input) {
  const payload = withDefaults(input);
  assertSchedule(payload);
  return ReportDefinition.create({
    ...payload,
    tenant_id: tenantId,
    created_by: user.id,
    updated_by: user.id,
  });
}

async function updateDefinition(tenantId, user, id, input) {
  assertSchedule(input);
  const updated = await ReportDefinition.findOneAndUpdate(
    { _id: id, tenant_id: tenantId },
    { $set: { ...input, updated_by: user.id } },
    { new: true, runValidators: true },
  ).lean();
  if (!updated) throw notFound("report_definition_not_found");
  return updated;
}

async function setDefinitionStatus(tenantId, user, id, status) {
  return updateDefinition(tenantId, user, id, { status });
}

module.exports = {
  listDefinitions,
  getDefinition,
  createDefinition,
  updateDefinition,
  setDefinitionStatus,
  runReportNow,
  previewReport,
};
