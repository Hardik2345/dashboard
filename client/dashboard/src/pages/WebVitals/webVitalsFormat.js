// Shared metric metadata/formatting for the Web Vitals panel — kept in one
// place so the KPI row, trend chart, and page table stay in sync.

// The source test_results collection stores some urls with the host
// duplicated as the first path segment, e.g.
// "https://shop.myshopify.com/shop.myshopify.com/products/x" — strip that
// duplicate segment for display.
export function normalizeWebVitalsUrl(rawUrl) {
  if (!rawUrl) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    const duplicatePrefix = `/${parsed.host}`;
    if (parsed.pathname === duplicatePrefix) {
      parsed.pathname = "/";
    } else if (parsed.pathname.startsWith(`${duplicatePrefix}/`)) {
      parsed.pathname = parsed.pathname.slice(duplicatePrefix.length);
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

export const METRIC_DEFS = {
  performance: {
    id: "performance",
    label: "Performance",
    shortLabel: "Perf.",
    color: "#06b6d4",
    axisGroup: "score",
    higherIsBetter: true,
    format: (value) => (value === null || value === undefined ? "—" : Math.round(value).toString()),
    formatDelta: (value) => Math.round(Math.abs(value)).toString(),
  },
  fcp: {
    id: "fcp",
    label: "First Contentful Paint",
    shortLabel: "FCP",
    color: "#10b981",
    axisGroup: "seconds",
    higherIsBetter: false,
    format: (value) => (value === null || value === undefined ? "—" : `${Number(value.toFixed(2))}s`),
    formatDelta: (value) => `${Number(Math.abs(value).toFixed(2))}s`,
  },
  lcp: {
    id: "lcp",
    label: "Largest Contentful Paint",
    shortLabel: "LCP",
    color: "#f59e0b",
    axisGroup: "seconds",
    higherIsBetter: false,
    format: (value) => (value === null || value === undefined ? "—" : `${Number(value.toFixed(2))}s`),
    formatDelta: (value) => `${Number(Math.abs(value).toFixed(2))}s`,
  },
  ttfb: {
    id: "ttfb",
    label: "Time to First Byte",
    shortLabel: "TTFB",
    color: "#3b82f6",
    axisGroup: "seconds",
    higherIsBetter: false,
    format: (value) => (value === null || value === undefined ? "—" : `${Number(value.toFixed(2))}s`),
    formatDelta: (value) => `${Number(Math.abs(value).toFixed(2))}s`,
  },
  inp: {
    id: "inp",
    label: "Interaction to Next Paint",
    shortLabel: "INP",
    color: "#8b5cf6",
    axisGroup: "milliseconds",
    higherIsBetter: false,
    format: (value) => (value === null || value === undefined ? "—" : `${Math.round(value)}ms`),
    formatDelta: (value) => `${Math.round(Math.abs(value))}ms`,
  },
  cls: {
    id: "cls",
    label: "Cumulative Layout Shift",
    shortLabel: "CLS",
    color: "#64748b",
    axisGroup: "unitless",
    higherIsBetter: false,
    format: (value) => (value === null || value === undefined ? "—" : Number(value.toFixed(2)).toString()),
    formatDelta: (value) => Number(Math.abs(value).toFixed(2)).toString(),
  },
};

export const METRIC_ORDER = ["performance", "fcp", "lcp", "ttfb", "inp", "cls"];

export const STATUS_META = {
  good: { label: "Good", color: "#10b981" },
  needs_improvement: { label: "Needs Improvement", color: "#f59e0b" },
  poor: { label: "Poor", color: "#ef4444" },
};

// Performance uses its own 4-tier scale/palette — see
// getPerformanceStatus in analytics/services/webVitals.service.js.
export const PERFORMANCE_STATUS_META = {
  good: { label: "Good", color: "#10b981" },
  needs_attention: { label: "Needs Attention", color: "#38bdf8" },
  poor: { label: "Poor", color: "#eab308" },
  critical: { label: "Critical", color: "#dc2626" },
};

export function getStatusMeta(status, metricId) {
  if (metricId === "performance") return PERFORMANCE_STATUS_META[status] || null;
  return STATUS_META[status] || null;
}
