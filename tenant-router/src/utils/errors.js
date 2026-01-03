class TenantError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

class TenantNotFoundError extends TenantError {
  constructor(brandId) {
    super(`Tenant not found: ${brandId}`, 404, 'tenant_not_found');
  }
}

class TenantSuspendedError extends TenantError {
  constructor(brandId) {
    super(`Tenant suspended: ${brandId}`, 403, 'tenant_suspended');
  }
}

class RoutingUnavailableError extends TenantError {
  constructor() {
    super('Routing metadata unavailable', 503, 'routing_unavailable');
  }
}

module.exports = {
  TenantError,
  TenantNotFoundError,
  TenantSuspendedError,
  RoutingUnavailableError
};
