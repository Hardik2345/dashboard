const crypto = require("crypto");
const logger = require("../../utils/logger");
const { callJson } = require("./llmClient");
const { buildDatumInsightsPrompt } = require("./prompts/datumInsights.v1");
const { buildFocusSummaryPrompt } = require("./prompts/focusSummary.v1");
const { validateDatumInsights, validateFocusItems } = require("./responseSchemas");

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function buildAiDatumInsights({ definition, period, kpis, fallback }) {
  const maxItems = definition.sections?.datum_insights?.max_items || 3;
  if (!definition.ai?.enabled || definition.sections?.datum_insights?.mode !== "ai_assisted") {
    return { items: fallback, metadata: { fallback_used: true } };
  }
  const payload = { report: { period_label: period.label }, kpis, constraints: { max_items: maxItems } };
  try {
    const output = await callJson(buildDatumInsightsPrompt(payload, maxItems), definition.ai.model);
    const items = validateDatumInsights(output, kpis.map((kpi) => kpi.key), maxItems);
    if (!items) throw new Error("invalid_ai_datum_insights");
    return { items, metadata: { input_hash: hash(payload), output_hash: hash(output), fallback_used: false } };
  } catch (err) {
    logger.warn("[reporting-service] datum insights AI fallback", { error: err.message });
    return { items: fallback, metadata: { input_hash: hash(payload), fallback_used: true } };
  }
}

async function buildAiFocusItems({ definition, period, tasks, fallback }) {
  const maxItems = definition.sections?.focus_summary?.max_items || 5;
  if (!definition.ai?.enabled || definition.sections?.focus_summary?.mode !== "ai_assisted") {
    return { items: fallback, metadata: { fallback_used: true } };
  }
  const payload = { report: { period_label: period.label }, tasks, constraints: { max_items: maxItems } };
  try {
    const output = await callJson(buildFocusSummaryPrompt(payload, maxItems), definition.ai.model);
    const taskIds = tasks.map((task) => String(task._id || task.id));
    const items = validateFocusItems(output, taskIds, maxItems);
    if (!items) throw new Error("invalid_ai_focus_items");
    return { items, metadata: { input_hash: hash(payload), output_hash: hash(output), fallback_used: false } };
  } catch (err) {
    logger.warn("[reporting-service] focus summary AI fallback", { error: err.message });
    return { items: fallback, metadata: { input_hash: hash(payload), fallback_used: true } };
  }
}

module.exports = { buildAiDatumInsights, buildAiFocusItems };
