const cdsService = require("./cds.service");
const cache = require("../cache/inMemoryCache");
const {
  TenantNotFoundError,
  TenantSuspendedError,
  RoutingUnavailableError,
} = require("../utils/errors");

/**
 * Orchestrates the resolution of brand routing metadata with Phase 1 logic:
 * 1. Cache HIT (within TTL) -> Return.
 * 2. Cache MISS/EXPIRY -> Call CDS.
 * 3. CDS SUCCESS -> Cache (if active) & Return.
 * 4. CDS FAILURE -> If STALE value in cache -> Return (Resilience).
 * 5. ELSE -> Fail (503).
 *
 * @param {string} brandId
 * @returns {Promise<Object>}
 */
const resolveTenant = async (brandId) => {
  // 1. Check In-Memory Cache (Strict TTL)
  const cachedTenant = cache.get(brandId);
  if (cachedTenant) {
    console.log(`[TenantRouter] Cache HIT (Active) for brand: ${brandId}`);
    return validateAndReturn(cachedTenant, brandId);
  }

  console.log(
    `[TenantRouter] Cache MISS/EXPIRY for brand: ${brandId}. Querying CDS...`,
  );

  // 2. Query CDS (Source of Truth)
  let tenant;
  try {
    tenant = await cdsService.resolveFromCDS(brandId);
  } catch (error) {
    console.error(
      `[TenantRouter] CDS failure for brand ${brandId}:`,
      error.message,
    );

    // Resilience: Cache hit (even if stale) + CDS failure -> Serve cached value
    const staleTenant = cache.getStale(brandId);
    if (staleTenant) {
      console.warn(
        `[TenantRouter] Serving STALE metadata for brand ${brandId} due to CDS failure`,
      );
      return validateAndReturn(staleTenant, brandId);
    }

    throw new RoutingUnavailableError();
  }

  // 3. Handle Result
  if (!tenant) {
    console.warn(`[TenantRouter] Brand not found in CDS: ${brandId}`);
    // Optional: could cache "NOT FOUND" but prompt says "No cache entry created" for unknown brands
    throw new TenantNotFoundError(brandId);
  }

  // 4. Validate before caching
  if (tenant.status !== "active") {
    console.warn(
      `[TenantRouter] Tenant ${brandId} status is ${tenant.status}. NOT caching.`,
    );
    // "Suspended brands MUST NOT be cached"
    throw new TenantSuspendedError(brandId);
  }

  // 5. Update Cache (Only Active Tenants)
  console.log(`[TenantRouter] Updating cache for brand: ${brandId}`);
  cache.set(brandId, tenant);

  return validateAndReturn(tenant, brandId);
};

/**
 * Validates tenant status before returning.
 * @param {Object} tenant
 * @param {string} brandId
 */
function validateAndReturn(tenant, brandId) {
  if (tenant.status !== "active") {
    console.warn(`[TenantRouter] Tenant ${brandId} status is ${tenant.status}`);
    throw new TenantSuspendedError(brandId);
  }
  return tenant;
}

module.exports = {
  resolveTenant,
};
