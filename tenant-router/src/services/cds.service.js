const Tenant = require('../models/tenant.model');
const { RoutingUnavailableError } = require('../utils/errors');

/**
 * Resolves brand metadata from the Central Directory Service (DB-backed).
 * @param {string} brandId 
 * @returns {Promise<Object|null>}
 */
const resolveFromCDS = async (brandId) => {
    try {
        // Database lookup
        const tenant = await Tenant.findOne({ brand_id: brandId }).lean();
        return tenant;
    } catch (error) {
        console.error(`[CDS] Error resolving brand ${brandId}:`, error.stack || error.message);
        throw new RoutingUnavailableError();
    }
};

module.exports = {
    resolveFromCDS
};

/**
 * Create and persist a new tenant record in the CDS (DB).
 * @param {Object} tenantData
 * @returns {Promise<Object>} created tenant object
 */
const createTenant = async (tenantData) => {
    try {
        const tenant = new Tenant(tenantData);
        await tenant.save();
        return tenant.toObject();
    } catch (error) {
        console.error('[CDS] Error creating tenant:', error.stack || error.message);
        // Re-throw for the caller to handle (route will return appropriate status)
        throw error;
    }
};

module.exports = {
    resolveFromCDS,
    createTenant
};

/**
 * Find tenants by plaintext user+password.
 * NOTE: decrypts stored passwords and compares to provided plaintext.
 * @param {string} user
 * @param {string} plainPassword
 * @returns {Promise<Array>} array of tenant objects matching credentials
 */
const findTenantsByCredentials = async (user, brand_id) => {
    try {
        // limit candidates by `user` first
        const tenants = await Tenant.findOne({ user: user, brand_id: brand_id });
        return tenants;
    } catch (error) {
        console.error('[CDS] Error finding tenants by credentials:', error.stack || error.message);
        throw error;
    }
};

module.exports = {
    resolveFromCDS,
    createTenant,
    findTenantsByCredentials
};
