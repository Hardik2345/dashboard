const DESKTOP_KPI_PAGE_SIZE = 8;
const MAX_PINNED_KPIS = 3;

const DEFAULT_DESKTOP_KPI_ORDER = Object.freeze([
  "orders",
  "revenue",
  "aov",
  "returns",
  "sessions",
  "atc",
  "checkout",
  "cvr",
  "rto",
]);

const DEFAULT_DESKTOP_KPI_LAYOUT = Object.freeze({
  order: DEFAULT_DESKTOP_KPI_ORDER,
  pinned: Object.freeze([]),
});

function uniqKpiIds(input = []) {
  const seen = new Set();
  const out = [];

  for (const raw of Array.isArray(input) ? input : []) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  return out;
}

function normalizeDesktopKpiLayout(input) {
  const source = input && typeof input === "object" ? input : {};
  const order = uniqKpiIds(source.order);

  for (const metricId of DEFAULT_DESKTOP_KPI_ORDER) {
    if (!order.includes(metricId)) {
      order.push(metricId);
    }
  }

  const validIds = new Set(order);
  const pinned = uniqKpiIds(source.pinned)
    .filter((id) => validIds.has(id))
    .slice(0, MAX_PINNED_KPIS);

  return {
    order,
    pinned,
  };
}

module.exports = {
  DESKTOP_KPI_PAGE_SIZE,
  MAX_PINNED_KPIS,
  DEFAULT_DESKTOP_KPI_ORDER,
  DEFAULT_DESKTOP_KPI_LAYOUT,
  normalizeDesktopKpiLayout,
};
