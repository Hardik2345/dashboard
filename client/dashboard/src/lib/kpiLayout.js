export const DESKTOP_KPI_PAGE_SIZE = 8;
export const MAX_PINNED_KPIS = 3;

export const DEFAULT_DESKTOP_KPI_ORDER = Object.freeze([
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

export const DEFAULT_DESKTOP_KPI_LAYOUT = Object.freeze({
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

export function normalizeDesktopKpiLayout(input) {
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

export function derivePinnedKpiOrder(layout) {
  const normalized = normalizeDesktopKpiLayout(layout);
  const pinnedSet = new Set(normalized.pinned);
  return normalized.order.filter((id) => pinnedSet.has(id));
}

export function deriveRenderedDesktopKpiOrder(layout) {
  const normalized = normalizeDesktopKpiLayout(layout);
  const pinnedSet = new Set(normalized.pinned);
  const pinned = [];
  const unpinned = [];

  for (const id of normalized.order) {
    if (pinnedSet.has(id)) {
      pinned.push(id);
    } else {
      unpinned.push(id);
    }
  }

  return [...pinned, ...unpinned];
}

export function paginateKpiIds(ids, pageSize = DESKTOP_KPI_PAGE_SIZE) {
  const items = Array.isArray(ids) ? ids : [];
  const pages = [];

  for (let index = 0; index < items.length; index += pageSize) {
    pages.push(items.slice(index, index + pageSize));
  }

  return pages.length > 0 ? pages : [[]];
}

function replacePartition(order, predicate, nextPartition) {
  const merged = [];
  let partitionIndex = 0;

  for (const id of order) {
    if (predicate(id)) {
      merged.push(nextPartition[partitionIndex]);
      partitionIndex += 1;
    } else {
      merged.push(id);
    }
  }

  return merged;
}

export function reorderDesktopKpiLayout(layout, activeId, overId) {
  const normalized = normalizeDesktopKpiLayout(layout);
  if (!activeId || !overId || activeId === overId) return normalized;

  const pinnedSet = new Set(normalized.pinned);
  const activePinned = pinnedSet.has(activeId);
  const overPinned = pinnedSet.has(overId);

  if (activePinned !== overPinned) {
    return normalized;
  }

  const partition = normalized.order.filter((id) => pinnedSet.has(id) === activePinned);
  const oldIndex = partition.indexOf(activeId);
  const newIndex = partition.indexOf(overId);

  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
    return normalized;
  }

  const nextPartition = [...partition];
  const [moved] = nextPartition.splice(oldIndex, 1);
  nextPartition.splice(newIndex, 0, moved);

  return normalizeDesktopKpiLayout({
    ...normalized,
    order: replacePartition(
      normalized.order,
      (id) => pinnedSet.has(id) === activePinned,
      nextPartition,
    ),
  });
}
