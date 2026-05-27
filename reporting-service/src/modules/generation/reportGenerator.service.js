const ReportDefinition = require("../../models/reportDefinition.model");
const ReportRun = require("../../models/reportRun.model");
const LoggedTask = require("../../models/loggedTask.model");
const TaskCategory = require("../../models/taskCategory.model");
const ReportEvent = require("../../models/reportEvent.model");
const { notFound } = require("../../utils/errors");
const { resolvePeriod } = require("./periodResolver");
const { collectKpis } = require("./kpiCollector");
const { buildDeterministicInsights } = require("./insightBuilder");
const { buildDeterministicFocusItems } = require("./focusBuilder");
const { buildAiDatumInsights, buildAiFocusItems } = require("../ai/aiSectionBuilder");
const { renderDigestEmail } = require("../rendering/renderer");
const { generateApprovalToken, hashApprovalToken } = require("../approval/approvalToken.service");
const { sendApprovalEmail } = require("../approval/approvalEmail.service");
const { dispatchReport } = require("../dispatch/dispatch.service");

async function writeEvent({ tenantId, runId, type, actorType = "system", actorId = null, payload = {} }) {
  return ReportEvent.create({
    tenant_id: tenantId,
    report_run_id: runId,
    event_type: type,
    actor_type: actorType,
    actor_id: actorId,
    payload,
  });
}

async function loadDefinition(tenantId, definitionId) {
  const definition = await ReportDefinition.findOne({ _id: definitionId, tenant_id: tenantId }).lean();
  if (!definition) throw notFound("report_definition_not_found");
  return definition;
}

async function loadTasks(tenantId, period) {
  const tasks = await LoggedTask.find({
    tenant_id: tenantId,
    task_date: { $gte: period.start_at, $lte: period.end_at },
  })
    .sort({ task_date: -1 })
    .lean();
  const categoryIds = [...new Set(tasks.map((task) => String(task.category_id || "")).filter(Boolean))];
  const categories = await TaskCategory.find({ tenant_id: tenantId, _id: { $in: categoryIds } }).lean();
  const categoryMap = new Map(
    categories.map((category) => [
      String(category._id),
      {
        name: category.name,
        icon: category.icon || "cursor",
        color: category.color || "#84cc16",
      },
    ]),
  );
  return tasks.map((task) => ({
    ...task,
    id: String(task._id),
    category_name: categoryMap.get(String(task.category_id))?.name || "General",
    category_icon: categoryMap.get(String(task.category_id))?.icon || "cursor",
    category_color: categoryMap.get(String(task.category_id))?.color || "#84cc16",
  }));
}

async function getOrCreateRun({ tenantId, definition, period }) {
  const existing = await ReportRun.findOne({
    report_definition_id: definition._id,
    "period.start_at": period.start_at,
    "period.end_at": period.end_at,
  });
  if (existing) return existing;
  return ReportRun.create({
    tenant_id: tenantId,
    report_definition_id: definition._id,
    status: "queued",
    period,
    approval: {
      required: definition.approval?.required !== false,
      status: definition.approval?.required === false ? "skipped" : "pending",
    },
  });
}

async function finalizeDispatch({ definition, run }) {
  await ReportRun.updateOne({ _id: run._id }, { $set: { status: "dispatching" }, $inc: { "dispatch.attempts": 1 } });
  try {
    const dispatch = await dispatchReport({ definition, run });
    const updated = await ReportRun.findByIdAndUpdate(
      run._id,
      {
        $set: {
          status: "sent",
          "dispatch.provider": dispatch.provider,
          "dispatch.message_id": dispatch.message_id,
          "dispatch.sent_at": dispatch.sent_at,
          "dispatch.recipients_count": dispatch.recipients_count,
        },
      },
      { new: true },
    );
    await writeEvent({ tenantId: run.tenant_id, runId: run._id, type: "sent", payload: dispatch });
    return updated;
  } catch (err) {
    await ReportRun.updateOne(
      { _id: run._id },
      { $set: { status: "failed", error: { code: "dispatch_failed", message: err.message } } },
    );
    await writeEvent({ tenantId: run.tenant_id, runId: run._id, type: "failed", payload: { message: err.message } });
    throw err;
  }
}

async function generateReport({ tenantId, user, definitionId, now = new Date(), preview = false }) {
  const definition = await loadDefinition(tenantId, definitionId);
  const period = resolvePeriod(definition.period, now);
  const run = preview
    ? new ReportRun({ tenant_id: tenantId, report_definition_id: definition._id, period, status: "generating" })
    : await getOrCreateRun({ tenantId, definition, period });

  if (!preview) {
    await ReportRun.updateOne({ _id: run._id }, { $set: { status: "generating", error: {} } });
    await writeEvent({ tenantId, runId: run._id, type: "queued", actorType: user ? "author" : "system", actorId: user?.id });
  }

  try {
    const kpis = await collectKpis({ tenantId, user, definition, period });
    const tasks = await loadTasks(tenantId, period);
    const datumFallback = definition.sections?.datum_insights?.enabled
      ? buildDeterministicInsights(kpis, definition.sections.datum_insights.max_items)
      : [];
    const focusFallback = definition.sections?.focus_summary?.enabled
      ? buildDeterministicFocusItems(tasks, definition.sections.focus_summary.max_items)
      : [];

    const datum = await buildAiDatumInsights({ definition, period, kpis, fallback: datumFallback });
    const focus = await buildAiFocusItems({ definition, period, tasks, fallback: focusFallback });
    const taskMetaById = new Map(
      tasks.map((task) => [
        String(task._id || task.id),
        {
          icon: task.category_icon || "cursor",
          color: task.category_color || "#84cc16",
        },
      ]),
    );
    const focusItems = focus.items.map((item) => {
      const firstTaskId = item.source_task_ids?.[0];
      const meta = taskMetaById.get(String(firstTaskId)) || {};
      return {
        ...item,
        icon: item.icon || meta.icon || "cursor",
        color: item.color || meta.color || "#84cc16",
      };
    });

    const snapshot = {
      kpis,
      datum_insights: datum.items,
      focus_items: focusItems,
    };
    snapshot.html = renderDigestEmail({ definition, run: { ...run.toObject?.() || run, tenant_id: tenantId, period, snapshot } });

    const aiMetadata = {
      provider: definition.ai?.provider || null,
      model: definition.ai?.model || null,
      datum_prompt_version: definition.ai?.datum_prompt_version || null,
      focus_prompt_version: definition.ai?.focus_prompt_version || null,
      input_hash: datum.metadata.input_hash || focus.metadata.input_hash || null,
      output_hash: datum.metadata.output_hash || focus.metadata.output_hash || null,
      fallback_used: Boolean(datum.metadata.fallback_used || focus.metadata.fallback_used),
    };

    if (preview) {
      return { period, snapshot, ai_metadata: aiMetadata };
    }

    const approvalRequired = definition.approval?.required !== false;
    const update = {
      snapshot,
      ai_metadata: aiMetadata,
      status: approvalRequired ? "pending_approval" : "dispatching",
      "approval.required": approvalRequired,
      "approval.status": approvalRequired ? "pending" : "skipped",
    };

    let approvalToken = null;
    if (approvalRequired) {
      approvalToken = generateApprovalToken();
      update["approval.token_hash"] = hashApprovalToken(approvalToken);
      update["approval.requested_at"] = new Date();
      update["approval.expires_at"] = new Date(Date.now() + (definition.approval?.expires_after_hours || 72) * 60 * 60 * 1000);
    }

    const saved = await ReportRun.findByIdAndUpdate(run._id, { $set: update }, { new: true });
    await writeEvent({ tenantId, runId: saved._id, type: "generated" });

    if (approvalRequired) {
      await sendApprovalEmail({ definition, run: saved, token: approvalToken });
      await writeEvent({ tenantId, runId: saved._id, type: "approval_requested" });
      return saved;
    }

    return finalizeDispatch({ definition, run: saved });
  } catch (err) {
    if (!preview) {
      await ReportRun.updateOne(
        { _id: run._id },
        { $set: { status: "failed", error: { code: "generation_failed", message: err.message } } },
      );
      await writeEvent({ tenantId, runId: run._id, type: "failed", payload: { message: err.message } });
    }
    throw err;
  }
}

async function previewReport(tenantId, user, definitionId, options = {}) {
  return generateReport({ tenantId, user, definitionId, now: options.now ? new Date(options.now) : new Date(), preview: true });
}

async function runReportNow(tenantId, user, definitionId, options = {}) {
  return generateReport({ tenantId, user, definitionId, now: options.now ? new Date(options.now) : new Date(), preview: false });
}

module.exports = { generateReport, previewReport, runReportNow, finalizeDispatch, writeEvent };
