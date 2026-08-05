const DiscoveredRoute = require("../models/DiscoveredRoute");

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeArray(values) {
  return Array.isArray(values)
    ? [...new Set(values.map((value) => normalizeString(value)).filter(Boolean))]
    : [];
}

function normalizeDiscoveredRoute(route, { serviceName, baseUrl }) {
  const method = normalizeString(route.method || "GET").toUpperCase();
  const path = normalizeString(route.path);
  if (!method || !path) {
    return null;
  }

  return {
    serviceName,
    baseUrl,
    method,
    path,
    routeType: normalizeString(route.routeType) || "read",
    hasPathParams: Boolean(route.hasPathParams),
    sourceModule: normalizeString(route.sourceModule),
    controllerHint: normalizeString(route.controllerHint),
    middlewareNames: normalizeArray(route.middlewareNames),
    authRequired: Boolean(route.authRequired),
    authInference: normalizeString(route.authInference) || "unknown",
    monitoringRecommendation:
      normalizeString(route.monitoringRecommendation) || "manual_review",
    successHint: normalizeString(route.successHint),
  };
}

function createRouteCatalogService({ logger }) {
  async function upsertRoutes({ serviceName, baseUrl, discoveredRoutes }) {
    if (!Array.isArray(discoveredRoutes) || discoveredRoutes.length === 0) {
      return 0;
    }

    const now = new Date();
    let upserted = 0;

    for (const route of discoveredRoutes) {
      const normalized = normalizeDiscoveredRoute(route, { serviceName, baseUrl });
      if (!normalized) {
        logger.warn("route_catalog.invalid_route", { serviceName, route });
        continue;
      }

      await DiscoveredRoute.findOneAndUpdate(
        {
          serviceName: normalized.serviceName,
          method: normalized.method,
          path: normalized.path,
        },
        {
          $set: {
            baseUrl: normalized.baseUrl,
            routeType: normalized.routeType,
            hasPathParams: normalized.hasPathParams,
            sourceModule: normalized.sourceModule,
            controllerHint: normalized.controllerHint,
            middlewareNames: normalized.middlewareNames,
            authRequired: normalized.authRequired,
            authInference: normalized.authInference,
            monitoringRecommendation: normalized.monitoringRecommendation,
            successHint: normalized.successHint,
            lastSeenAt: now,
          },
          $setOnInsert: {
            firstSeenAt: now,
          },
        },
        { upsert: true, new: true },
      );
      upserted += 1;
    }

    logger.info("route_catalog.upserted", {
      serviceName,
      routes: upserted,
    });
    return upserted;
  }

  return {
    upsertRoutes,
  };
}

module.exports = {
  createRouteCatalogService,
  normalizeDiscoveredRoute,
};
