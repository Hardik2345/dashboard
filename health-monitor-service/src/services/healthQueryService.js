const Service = require("../models/Service");
const MonitorRun = require("../models/MonitorRun");
const Incident = require("../models/Incident");
const { sanitizeIncident } = require("./incidentSanitizer");

const STATUS_RANK = { HEALTHY: 0, UNKNOWN: 1, DEGRADED: 2, UNHEALTHY: 3 };

const RANGE_CONFIG = {
  "1h": { windowMs: 60 * 60 * 1000, bucketMs: 60 * 1000 },
  "6h": { windowMs: 6 * 60 * 60 * 1000, bucketMs: 5 * 60 * 1000 },
  "24h": { windowMs: 24 * 60 * 60 * 1000, bucketMs: 15 * 60 * 1000 },
  "7d": { windowMs: 7 * 24 * 60 * 60 * 1000, bucketMs: 60 * 60 * 1000 },
  "30d": { windowMs: 30 * 24 * 60 * 60 * 1000, bucketMs: 24 * 60 * 60 * 1000 },
};

function getEndpointKey(endpoint) {
  return `${endpoint.method} ${endpoint.path}`;
}

function formatIntervalLabel(intervalSeconds) {
  const seconds = Number(intervalSeconds) || 0;
  if (seconds <= 0) return "Unknown interval";
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `Every ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `Every ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `Every ${seconds} seconds`;
}

function createHealthQueryService({ logger }) {
  async function getLatestRunsByEndpoint(serviceNames = []) {
    const match = serviceNames.length ? { service: { $in: serviceNames } } : {};
    const rows = await MonitorRun.aggregate([
      { $match: match },
      { $sort: { service: 1, endpoint: 1, timestamp: -1 } },
      {
        $group: {
          _id: { service: "$service", endpoint: "$endpoint" },
          status: { $first: "$status" },
          latency: { $first: "$latency" },
          responseCode: { $first: "$responseCode" },
          timestamp: { $first: "$timestamp" },
        },
      },
    ]);

    const map = new Map();
    for (const row of rows) {
      map.set(`${row._id.service}::${row._id.endpoint}`, {
        status: row.status,
        latency: row.latency,
        responseCode: row.responseCode,
        timestamp: row.timestamp,
      });
    }
    return map;
  }

  async function getOpenIncidentCountsByService() {
    const rows = await Incident.aggregate([
      { $match: { status: "OPEN" } },
      {
        $group: {
          _id: "$service",
          total: { $sum: 1 },
          critical: { $sum: { $cond: [{ $eq: ["$severity", "CRITICAL"] }, 1, 0] } },
        },
      },
    ]);

    const map = new Map();
    for (const row of rows) {
      map.set(row._id, { total: row.total, critical: row.critical });
    }
    return map;
  }

  function computeEndpointStatus(endpointDoc, latestRun) {
    if (!latestRun || !latestRun.timestamp) return "UNKNOWN";
    const staleAfterMs = 3 * Number(endpointDoc.intervalSeconds || 0) * 1000;
    if (staleAfterMs > 0 && Date.now() - new Date(latestRun.timestamp).getTime() > staleAfterMs) {
      return "UNKNOWN";
    }
    return latestRun.status === "SUCCESS" ? "HEALTHY" : "UNHEALTHY";
  }

  function computeServiceStatus(endpointSummaries, hasOpenCriticalIncident) {
    if (!endpointSummaries.length) return "UNKNOWN";
    const anyCriticalUnhealthy = endpointSummaries.some(
      (endpoint) => endpoint.critical && endpoint.status === "UNHEALTHY",
    );
    if (anyCriticalUnhealthy || hasOpenCriticalIncident) return "UNHEALTHY";

    const anyDegraded = endpointSummaries.some(
      (endpoint) => endpoint.status === "UNHEALTHY" || endpoint.status === "UNKNOWN",
    );
    if (anyDegraded) return "DEGRADED";

    const allUnknown = endpointSummaries.every((endpoint) => endpoint.status === "UNKNOWN");
    if (allUnknown) return "UNKNOWN";

    return "HEALTHY";
  }

  function buildEndpointSummaries(serviceDoc, latestRunsMap) {
    return (serviceDoc.endpoints || []).map((endpoint) => {
      const latestRun = latestRunsMap.get(`${serviceDoc.serviceName}::${getEndpointKey(endpoint)}`);
      const status = computeEndpointStatus(endpoint, latestRun);
      return {
        path: endpoint.path,
        method: endpoint.method,
        critical: endpoint.critical,
        intervalSeconds: endpoint.intervalSeconds,
        intervalLabel: formatIntervalLabel(endpoint.intervalSeconds),
        expectedStatus: endpoint.expectedStatus,
        status,
        latency: latestRun ? latestRun.latency : null,
        responseCode: latestRun ? latestRun.responseCode : null,
        lastCheckedAt: latestRun ? latestRun.timestamp : null,
      };
    });
  }

  async function getSummary() {
    const services = await Service.find({}).lean();
    const serviceNames = services.map((service) => service.serviceName);
    const [latestRunsMap, openIncidentCounts] = await Promise.all([
      getLatestRunsByEndpoint(serviceNames),
      getOpenIncidentCountsByService(),
    ]);

    let servicesHealthy = 0;
    let endpointsTotal = 0;
    let endpointsHealthy = 0;
    let openIncidents = 0;
    let criticalIncidents = 0;
    let worstStatus = "HEALTHY";

    for (const serviceDoc of services) {
      const endpointSummaries = buildEndpointSummaries(serviceDoc, latestRunsMap);
      const incidentCounts = openIncidentCounts.get(serviceDoc.serviceName) || { total: 0, critical: 0 };
      const serviceStatus = computeServiceStatus(endpointSummaries, incidentCounts.critical > 0);

      endpointsTotal += endpointSummaries.length;
      endpointsHealthy += endpointSummaries.filter((endpoint) => endpoint.status === "HEALTHY").length;
      if (serviceStatus === "HEALTHY") servicesHealthy += 1;
      openIncidents += incidentCounts.total;
      criticalIncidents += incidentCounts.critical;

      if (STATUS_RANK[serviceStatus] > STATUS_RANK[worstStatus]) {
        worstStatus = serviceStatus;
      }
    }

    return {
      systemStatus: services.length ? worstStatus : "UNKNOWN",
      servicesTotal: services.length,
      servicesHealthy,
      endpointsTotal,
      endpointsHealthy,
      openIncidents,
      criticalIncidents,
      lastUpdated: new Date(),
    };
  }

  async function listServices() {
    const services = await Service.find({}).lean();
    const serviceNames = services.map((service) => service.serviceName);
    const [latestRunsMap, openIncidentCounts] = await Promise.all([
      getLatestRunsByEndpoint(serviceNames),
      getOpenIncidentCountsByService(),
    ]);

    return services.map((serviceDoc) => {
      const endpointSummaries = buildEndpointSummaries(serviceDoc, latestRunsMap);
      const incidentCounts = openIncidentCounts.get(serviceDoc.serviceName) || { total: 0, critical: 0 };
      return {
        serviceName: serviceDoc.serviceName,
        status: computeServiceStatus(endpointSummaries, incidentCounts.critical > 0),
        endpointsTotal: endpointSummaries.length,
        endpointsHealthy: endpointSummaries.filter((endpoint) => endpoint.status === "HEALTHY").length,
        endpoints: endpointSummaries,
        openIncidents: incidentCounts.total,
        criticalIncidents: incidentCounts.critical,
      };
    });
  }

  async function getServiceDetail(serviceName) {
    const serviceDoc = await Service.findOne({ serviceName }).lean();
    if (!serviceDoc) return null;

    const [latestRunsMap, openIncidentCounts, openIncidentDocs, resolvedIncidentDocs] = await Promise.all([
      getLatestRunsByEndpoint([serviceName]),
      getOpenIncidentCountsByService(),
      Incident.find({ service: serviceName, status: "OPEN" }).sort({ startedAt: -1 }).limit(10).lean(),
      Incident.find({ service: serviceName, status: "RESOLVED" }).sort({ resolvedAt: -1 }).limit(5).lean(),
    ]);

    const endpointSummaries = buildEndpointSummaries(serviceDoc, latestRunsMap);
    const incidentCounts = openIncidentCounts.get(serviceName) || { total: 0, critical: 0 };

    return {
      serviceName: serviceDoc.serviceName,
      baseUrl: serviceDoc.baseUrl,
      status: computeServiceStatus(endpointSummaries, incidentCounts.critical > 0),
      dependencies: serviceDoc.dependencies || [],
      registeredAt: serviceDoc.registeredAt,
      lastRegistrationAt: serviceDoc.lastRegistrationAt,
      endpoints: endpointSummaries,
      openIncidents: incidentCounts.total,
      criticalIncidents: incidentCounts.critical,
      recentIncidents: {
        open: openIncidentDocs.map(sanitizeIncident),
        resolved: resolvedIncidentDocs.map(sanitizeIncident),
      },
    };
  }

  async function getEndpointHistory({ serviceName, endpoint, range }) {
    const rangeConfig = RANGE_CONFIG[range];
    if (!rangeConfig) {
      const error = new Error("invalid_range");
      error.statusCode = 400;
      throw error;
    }

    const serviceDoc = await Service.findOne({ serviceName }).lean();
    if (!serviceDoc) {
      const error = new Error("service_not_found");
      error.statusCode = 404;
      throw error;
    }
    const endpointExists = (serviceDoc.endpoints || []).some(
      (candidate) => getEndpointKey(candidate) === endpoint,
    );
    if (!endpointExists) {
      const error = new Error("endpoint_not_found");
      error.statusCode = 404;
      throw error;
    }

    const { windowMs, bucketMs } = rangeConfig;
    const windowStart = new Date(Date.now() - windowMs);

    const rows = await MonitorRun.aggregate([
      { $match: { service: serviceName, endpoint, timestamp: { $gte: windowStart } } },
      {
        $group: {
          _id: {
            $toDate: {
              $subtract: [{ $toLong: "$timestamp" }, { $mod: [{ $toLong: "$timestamp" }, bucketMs] }],
            },
          },
          avgLatency: { $avg: "$latency" },
          successCount: { $sum: { $cond: [{ $eq: ["$status", "SUCCESS"] }, 1, 0] } },
          total: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    if (!rows.length) {
      return { range, buckets: [], availabilityPct: null };
    }

    let totalSuccess = 0;
    let totalRuns = 0;
    const buckets = rows.map((row) => {
      totalSuccess += row.successCount;
      totalRuns += row.total;
      return {
        timestamp: row._id,
        avgLatency: row.avgLatency == null ? null : Math.round(row.avgLatency),
        uptimePct: row.total ? Math.round((row.successCount / row.total) * 1000) / 10 : null,
      };
    });

    return {
      range,
      buckets,
      availabilityPct: totalRuns ? Math.round((totalSuccess / totalRuns) * 1000) / 10 : null,
    };
  }

  async function listIncidents({ status, severity, service, from, to, page = 1, pageSize = 25 }) {
    const filter = {};
    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (service) filter.service = service;
    if (from || to) {
      filter.startedAt = {};
      if (from) filter.startedAt.$gte = new Date(from);
      if (to) filter.startedAt.$lte = new Date(to);
    }

    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 25));

    const [docs, total] = await Promise.all([
      Incident.find(filter)
        .sort({ startedAt: -1 })
        .skip((safePage - 1) * safePageSize)
        .limit(safePageSize)
        .lean(),
      Incident.countDocuments(filter),
    ]);

    return {
      incidents: docs.map(sanitizeIncident),
      page: safePage,
      pageSize: safePageSize,
      total,
    };
  }

  return {
    getSummary,
    listServices,
    getServiceDetail,
    getEndpointHistory,
    listIncidents,
    getEndpointKey,
    formatIntervalLabel,
  };
}

module.exports = { createHealthQueryService, RANGE_CONFIG, getEndpointKey, formatIntervalLabel };
