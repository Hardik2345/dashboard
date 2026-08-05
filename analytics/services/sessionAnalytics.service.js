const { connectSessionAnalyticsMongo } = require("../db/sessionAnalytics.mongo");
const { buildSessionAnalyticsRepository } = require("../repositories/sessionAnalytics.repository");

function startOfDay(date) {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date) {
  const next = new Date(date);
  next.setUTCHours(23, 59, 59, 999);
  return next;
}

function parseDate(value, boundary = "start") {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T00:00:00.000Z`
    : raw;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return boundary === "end" ? endOfDay(parsed) : startOfDay(parsed);
}

function formatDateTag(from, to) {
  const f = from ? from.toISOString().slice(0, 10) : "all";
  const t = to ? to.toISOString().slice(0, 10) : "all";
  return f === t ? f : `${f}_to_${t}`;
}

function normalizeGranularity(granularity, from, to) {
  if (granularity === "hourly" || granularity === "daily") return granularity;
  if (!from || !to) return "daily";
  return from.toISOString().slice(0, 10) === to.toISOString().slice(0, 10)
    ? "hourly"
    : "daily";
}

function fillTrendGaps(rows, { from, to, granularity }) {
  if (!from || !to) return rows;
  const valueMap = new Map(
    (Array.isArray(rows) ? rows : []).map((row) => [row.label, Number(row.sessions || 0)]),
  );

  if (granularity === "hourly") {
    return Array.from({ length: 24 }).map((_, hour) => {
      const label = `${String(hour).padStart(2, "0")}:00`;
      return {
        label,
        sessions: valueMap.get(label) || 0,
      };
    });
  }

  const output = [];
  const cursor = new Date(from);
  const limit = new Date(to);
  cursor.setUTCHours(0, 0, 0, 0);
  limit.setUTCHours(0, 0, 0, 0);

  while (cursor <= limit) {
    const label = cursor.toISOString().slice(0, 10);
    output.push({
      label,
      sessions: valueMap.get(label) || 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return output;
}

function getAllowedBrands(user = {}) {
  if (user.isAuthor) return null;
  if (Array.isArray(user.allowedBrands) && user.allowedBrands.length > 0) {
    return [...new Set(user.allowedBrands.map((brand) => String(brand || "").trim().toUpperCase()).filter(Boolean))];
  }
  const memberships = Array.isArray(user.memberships)
    ? user.memberships
    : [];
  const seen = new Set();
  const brands = [];
  for (const membership of memberships) {
    const key = (membership?.brand_id || membership?.brandId || "").toString().trim().toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    brands.push(key);
  }
  return brands;
}

function buildScope(user = {}) {
  if (user.isAuthor) {
    return {
      includeAdmins: true,
      allowedBrands: null,
    };
  }

  const allowedBrands = getAllowedBrands(user);
  return {
    includeAdmins: false,
    allowedBrands:
      allowedBrands && allowedBrands.length > 0
        ? allowedBrands
        : user.brandKey
          ? [String(user.brandKey).trim().toUpperCase()]
          : [],
  };
}

function normalizeFilters(query = {}) {
  const from = parseDate(query.from || query.start, "start");
  const to = parseDate(query.to || query.end, "end");
  if ((query.from || query.start) && !from) {
    const error = new Error("Invalid from date");
    error.status = 400;
    throw error;
  }
  if ((query.to || query.end) && !to) {
    const error = new Error("Invalid to date");
    error.status = 400;
    throw error;
  }
  if (from && to && from > to) {
    const error = new Error("from must be on or before to");
    error.status = 400;
    throw error;
  }

  return {
    from,
    to,
    brand: (query.brand || "").toString().trim().toUpperCase() || "",
    user: (query.user || "").toString().trim().toLowerCase() || "",
    search: (query.search || "").toString().trim(),
  };
}

function buildPagination(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 10));
  const sort = (query.sort || "sessions").toString().trim();
  const direction = (query.direction || "desc").toString().trim().toLowerCase() === "asc"
    ? "asc"
    : "desc";

  return { page, limit, sort, direction };
}

function timeAgo(timestamp) {
  if (!timestamp) return null;
  const diffMs = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(diffMs)) return null;
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function buildRepository() {
  const collection = await connectSessionAnalyticsMongo();
  return buildSessionAnalyticsRepository({ collection });
}

async function getSummary({ user, query }) {
  const repository = await buildRepository();
  return repository.getSummary({
    scope: buildScope(user),
    filters: normalizeFilters(query),
  });
}

async function getTrend({ user, query }) {
  const repository = await buildRepository();
  const filters = normalizeFilters(query);
  const granularity = normalizeGranularity(query.granularity, filters.from, filters.to);
  const rows = await repository.getTrend({
    scope: buildScope(user),
    filters,
    granularity,
  });
  return fillTrendGaps(rows, {
    from: filters.from,
    to: filters.to,
    granularity,
  });
}

async function getBrands({ user, query }) {
  const repository = await buildRepository();
  const filters = normalizeFilters(query);
  return repository.getBrandRows({
    scope: buildScope(user),
    filters,
  });
}

async function getUsers({ user, query }) {
  const repository = await buildRepository();
  const filters = normalizeFilters(query);
  const pagination = buildPagination(query);
  return repository.getUserRows({
    scope: buildScope(user),
    filters,
    ...pagination,
  });
}

async function getInsights({ user, query }) {
  const repository = await buildRepository();
  const result = await repository.getInsights({
    scope: buildScope(user),
    filters: normalizeFilters(query),
  });

  return {
    mostActiveUser: result.mostActiveUser || {},
    mostActiveBrand: result.mostActiveBrand || {},
    latestSession: result.latestSession
      ? {
          ...result.latestSession,
          timeAgo: timeAgo(result.latestSession.timestamp),
        }
      : {},
  };
}

async function getFilters({ user, query }) {
  const repository = await buildRepository();
  return repository.getFilters({
    scope: buildScope(user),
    filters: normalizeFilters(query),
  });
}

async function exportBrands({ user, query }) {
  const repository = await buildRepository();
  const filters = normalizeFilters(query);
  return {
    filename: `session_brands_${formatDateTag(filters.from, filters.to)}.csv`,
    csv: await repository.getBrandExportCsv({
      scope: buildScope(user),
      filters,
    }),
  };
}

async function exportUsers({ user, query }) {
  const repository = await buildRepository();
  const filters = normalizeFilters(query);
  const pagination = buildPagination(query);
  return {
    filename: `session_users_${formatDateTag(filters.from, filters.to)}.csv`,
    csv: await repository.getUserExportCsv({
      scope: buildScope(user),
      filters,
      sort: pagination.sort,
      direction: pagination.direction,
    }),
  };
}

module.exports = {
  getSummary,
  getTrend,
  getBrands,
  getUsers,
  getInsights,
  getFilters,
  exportBrands,
  exportUsers,
  buildScope,
  normalizeFilters,
  normalizeGranularity,
};
