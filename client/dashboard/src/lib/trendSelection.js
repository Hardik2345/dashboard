export const DEFAULT_TREND_METRIC = "sales";
export const MAX_SELECTED_TREND_METRICS = 3;

export const TREND_METRICS = [
  "sales",
  "orders",
  "sessions",
  "cvr",
  "atc",
  "ci_events",
  "checkout_rate",
  "atc_rate",
  "aov",
  "performance",
];

export const TREND_METRIC_SET = new Set(TREND_METRICS);
export const CI_TREND_METRICS = new Set(["ci_events", "checkout_rate"]);
export const DISCOUNT_ALLOWED_TREND_METRICS = new Set([
  "orders",
  "sales",
  "aov",
  "ci_events",
  "performance",
]);

export function normalizeTrendMetric(metricKey) {
  if (!metricKey) return null;
  return TREND_METRIC_SET.has(metricKey) ? metricKey : null;
}

export function sanitizeTrendMetricSelection(selectedMetrics, activeMetric) {
  const nextSelected = [];
  const seen = new Set();

  for (const metricKey of Array.isArray(selectedMetrics) ? selectedMetrics : []) {
    const normalized = normalizeTrendMetric(metricKey);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    nextSelected.push(normalized);
  }

  const cappedSelected = nextSelected.slice(-MAX_SELECTED_TREND_METRICS);
  const normalizedActive = normalizeTrendMetric(activeMetric);

  return {
    selectedMetrics: cappedSelected,
    activeMetric: normalizedActive,
  };
}

export function toggleTrendMetricSelection(
  selectedMetrics,
  activeMetric,
  metricKey,
  options = {},
) {
  const normalizedMetric = normalizeTrendMetric(metricKey);
  if (!normalizedMetric) {
    return sanitizeTrendMetricSelection(selectedMetrics, activeMetric);
  }

  const current = sanitizeTrendMetricSelection(selectedMetrics, activeMetric);
  const replaceMetricKey = normalizeTrendMetric(options.replaceMetricKey);
  const nextSelected = [...current.selectedMetrics];

  if (replaceMetricKey && nextSelected.includes(replaceMetricKey)) {
    const replaced = nextSelected.map((entry) =>
      entry === replaceMetricKey ? normalizedMetric : entry,
    );
    return sanitizeTrendMetricSelection(replaced, normalizedMetric);
  }

  const existingIndex = nextSelected.indexOf(normalizedMetric);
  if (existingIndex >= 0) {
    nextSelected.splice(existingIndex, 1);
    return sanitizeTrendMetricSelection(nextSelected, current.activeMetric);
  }

  nextSelected.push(normalizedMetric);
  if (nextSelected.length > MAX_SELECTED_TREND_METRICS) {
    nextSelected.splice(0, nextSelected.length - MAX_SELECTED_TREND_METRICS);
  }

  return sanitizeTrendMetricSelection(nextSelected, normalizedMetric);
}
