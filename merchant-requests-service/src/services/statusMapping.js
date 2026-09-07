const { LEGACY_STATUS_MAP, STATUSES } = require("../config");

function normalizeStoredStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return LEGACY_STATUS_MAP[normalized] || normalized;
}

function normalizeStatus(status) {
  const normalized = normalizeStoredStatus(status);
  if (!STATUSES.includes(normalized)) {
    const err = new Error("invalid_status");
    err.statusCode = 400;
    throw err;
  }
  return normalized;
}

function statusToSectionId(status, sectionByStatus) {
  const normalized = normalizeStatus(status);
  return sectionByStatus[normalized] || "";
}

function sectionIdToStatus(sectionId, sectionByStatus) {
  const raw = String(sectionId || "").trim();
  if (!raw) return null;
  const match = Object.entries(sectionByStatus).find(([, id]) => String(id) === raw);
  return match ? match[0] : null;
}

module.exports = {
  normalizeStatus,
  normalizeStoredStatus,
  sectionIdToStatus,
  statusToSectionId,
};
