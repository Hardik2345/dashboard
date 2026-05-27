const { fetchSummary, mapSummaryValue } = require("../integrations/analyticsClient");
const { getKpiDefinition } = require("./kpiRegistry");

function formatValue(value, format) {
  if (format === "currency") return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  if (format === "percent") return `${Number(value || 0).toFixed(2)}%`;
  return Number(value || 0).toLocaleString("en-IN");
}

function computeDelta(current, previous) {
  if (!previous) {
    return current ? 100 : 0;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

async function collectKpis({ tenantId, user, definition, period }) {
  const selected = (definition.kpis || [])
    .filter((kpi) => kpi.enabled)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

  const currentSummary = await fetchSummary({
    tenantId,
    user,
    startAt: period.start_at,
    endAt: period.end_at,
  });
  const previousSummary = await fetchSummary({
    tenantId,
    user,
    startAt: period.comparison_start_at,
    endAt: period.comparison_end_at,
  });

  return selected.map((config) => {
    const registry = getKpiDefinition(config.key);
    const current = mapSummaryValue(currentSummary, config.key);
    const previous = mapSummaryValue(previousSummary, config.key);
    const delta = computeDelta(current, previous);
    const higherIsBetter = registry?.higher_is_better !== false;
    const positiveMovement = delta >= 0 ? higherIsBetter : !higherIsBetter;
    return {
      key: config.key,
      label: config.label || registry?.default_label || config.key,
      value: current,
      formatted_value: formatValue(current, config.format || registry?.format),
      previous_value: previous,
      formatted_previous_value: formatValue(previous, config.format || registry?.format),
      delta_percent: Number(delta.toFixed(2)),
      direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
      business_polarity: delta === 0 ? "neutral" : positiveMovement ? "positive" : "negative",
      importance_weight: registry?.default_importance_weight || 50,
      min_delta_percent_for_insight: registry?.min_delta_percent_for_insight || 5,
      format: config.format || registry?.format || "number",
    };
  });
}

module.exports = { collectKpis, formatValue };
