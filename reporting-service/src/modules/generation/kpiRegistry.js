const KPI_REGISTRY = {
  total_orders: {
    key: "total_orders",
    default_label: "Total Orders",
    format: "number",
    higher_is_better: true,
    default_importance_weight: 90,
    min_delta_percent_for_insight: 5,
    analytics_handler: "summary",
  },
  gross_revenue: {
    key: "gross_revenue",
    default_label: "Gross Revenue",
    format: "currency",
    higher_is_better: true,
    default_importance_weight: 95,
    min_delta_percent_for_insight: 5,
    analytics_handler: "summary",
  },
  average_order_value: {
    key: "average_order_value",
    default_label: "Average Order Value",
    format: "currency",
    higher_is_better: true,
    default_importance_weight: 85,
    min_delta_percent_for_insight: 4,
    analytics_handler: "summary",
  },
  total_sessions: {
    key: "total_sessions",
    default_label: "Total Sessions",
    format: "number",
    higher_is_better: true,
    default_importance_weight: 80,
    min_delta_percent_for_insight: 5,
    analytics_handler: "summary",
  },
  atc_rate: {
    key: "atc_rate",
    default_label: "ATC Rate",
    format: "percent",
    higher_is_better: true,
    default_importance_weight: 80,
    min_delta_percent_for_insight: 5,
    analytics_handler: "summary",
  },
  conversion_rate: {
    key: "conversion_rate",
    default_label: "Conversion Rate",
    format: "percent",
    higher_is_better: true,
    default_importance_weight: 95,
    min_delta_percent_for_insight: 4,
    analytics_handler: "summary",
  },
};

function getKpiDefinition(key) {
  return KPI_REGISTRY[key] || null;
}

function buildKpiDefaults() {
  return Object.values(KPI_REGISTRY).map((kpi, index) => ({
    key: kpi.key,
    label: kpi.default_label,
    enabled: true,
    order: index + 1,
    format: kpi.format,
    comparison: "previous_period",
    visualization: "card",
  }));
}

module.exports = { KPI_REGISTRY, getKpiDefinition, buildKpiDefaults };
