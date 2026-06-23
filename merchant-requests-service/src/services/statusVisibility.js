const DEFAULT_VISIBLE_STATUSES = ["submitted", "in_progress", "closed"];

// Maps each internal status to the visible bucket merchants see by default
const STATUS_BUCKET_MAP = {
  submitted: "submitted",
  triaged: "submitted",
  in_progress: "in_progress",
  waiting_on_merchant: "in_progress",
  resolved: "in_progress",
  closed: "closed",
  cancelled: "closed",
};

// Internal statuses that authors can unlock for specific brands
const UNLOCKABLE_STATUSES = ["triaged", "waiting_on_merchant", "resolved", "cancelled"];

function getVisibleStatuses(brandConfig) {
  const unlocked = brandConfig?.unlocked_statuses || [];
  return [...new Set([...DEFAULT_VISIBLE_STATUSES, ...unlocked])];
}

// Returns the status to show the merchant; falls back to the bucket if status is internal
function maskStatus(internalStatus, visibleStatuses) {
  if (visibleStatuses.includes(internalStatus)) return internalStatus;
  return STATUS_BUCKET_MAP[internalStatus] || internalStatus;
}

// Expands a visible bucket status to all DB-level statuses that should be queried
// e.g. expandStatusFilter("in_progress", defaults) → ["in_progress", "waiting_on_merchant", "resolved"]
// e.g. expandStatusFilter("in_progress", [...defaults, "waiting_on_merchant"]) → ["in_progress", "resolved"]
function expandStatusFilter(queryStatus, visibleStatuses) {
  const allInBucket = Object.entries(STATUS_BUCKET_MAP)
    .filter(([, bucketKey]) => bucketKey === queryStatus)
    .map(([status]) => status);
  if (allInBucket.length === 0) return [queryStatus];
  // Include the queried status itself, plus any bucket members that aren't separately visible
  return allInBucket.filter((s) => s === queryStatus || !visibleStatuses.includes(s));
}

module.exports = {
  DEFAULT_VISIBLE_STATUSES,
  STATUS_BUCKET_MAP,
  UNLOCKABLE_STATUSES,
  expandStatusFilter,
  getVisibleStatuses,
  maskStatus,
};
