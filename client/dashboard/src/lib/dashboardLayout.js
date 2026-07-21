import {
  DEFAULT_DESKTOP_KPI_LAYOUT,
  normalizeDesktopKpiLayout,
} from "./kpiLayout.js";

export const DASHBOARD_LAYOUT_VERSION = 2;

export const DASHBOARD_LAYOUT_DEFAULTS = Object.freeze({
  desktop: Object.freeze([
    "kpi_cards",
    "kpi_trend",
    "payment_split",
    "payment_trend",
    "traffic_split",
  ]),
  mobile: Object.freeze([
    "kpi_cards",
    "kpi_trend",
    "top_pages",
    "payment_split",
    "payment_trend",
    "traffic_split",
  ]),
});

export const DASHBOARD_WIDGET_LABELS = Object.freeze({
  kpi_cards: "KPI Cards",
  kpi_trend: "KPI Trend",
  top_pages: "Top Pages",
  payment_split: "Mode of Payment",
  payment_trend: "Payment Trend",
  traffic_split: "Traffic Split",
});

function uniqWidgetIds(input = []) {
  const seen = new Set();
  const out = [];

  for (const raw of Array.isArray(input) ? input : []) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id || id === "overall_snapshot" || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  return out;
}

function normalizeViewportLayout(input, defaults) {
  const normalized = uniqWidgetIds(input);
  for (const widgetId of defaults) {
    if (!normalized.includes(widgetId)) {
      normalized.push(widgetId);
    }
  }
  return normalized;
}

export function normalizeDashboardLayout(layout) {
  const source = layout && typeof layout === "object" ? layout : {};
  return {
    version: DASHBOARD_LAYOUT_VERSION,
    desktop: normalizeViewportLayout(
      source.desktop,
      DASHBOARD_LAYOUT_DEFAULTS.desktop,
    ),
    mobile: normalizeViewportLayout(
      source.mobile,
      DASHBOARD_LAYOUT_DEFAULTS.mobile,
    ),
    kpiCardsDesktop: normalizeDesktopKpiLayout(
      source.kpiCardsDesktop || source.kpi_cards_desktop || DEFAULT_DESKTOP_KPI_LAYOUT,
    ),
  };
}

export function getVisibleDashboardWidgetIds({
  viewport,
  layout,
  hasPermission,
}) {
  const normalized = normalizeDashboardLayout(layout);
  const ordered = normalized[viewport] || [];
  const canSeePayments =
    hasPermission("payment_split_order") || hasPermission("payment_split_sales");

  return ordered.filter((widgetId) => {
    if (widgetId === "top_pages") return hasPermission("web_vitals");
    if (widgetId === "payment_split" || widgetId === "payment_trend") {
      return canSeePayments;
    }
    if (widgetId === "traffic_split") return hasPermission("traffic_split");
    return true;
  });
}
