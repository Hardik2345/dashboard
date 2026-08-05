const GlobalUser = require('../models/GlobalUser.model');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const {
    AUTH_ROLES,
    DEFAULT_PERMISSIONS,
    fetchAllBrandIds,
    normalizeBrandIds,
    normalizePermissions,
    normalizePrimaryBrand,
    normalizeRole,
} = require('./rbac.service');

function normalizeLegacyAssignment(brand_ids = [], primary_brand_id = null) {
    const brandIds = normalizeBrandIds(brand_ids);
    let primary = normalizePrimaryBrand(primary_brand_id);
    if (primary && !brandIds.includes(primary)) brandIds.push(primary);
    return { brandIds, primary };
}

function buildMemberships(brandIds, permissions) {
    return brandIds.map((brandId) => ({
        brand_id: brandId,
        status: 'active',
        permissions,
    }));
}

async function buildUserAssignment({ role, brand_ids = [], primary_brand_id = null, permissions = DEFAULT_PERMISSIONS }) {
    const normalizedRole = normalizeRole(role);

    if (!AUTH_ROLES.includes(normalizedRole)) throw new Error('invalid role');

    if (normalizedRole === 'super_admin') {
        const brandIds = await fetchAllBrandIds();
        return {
            role: normalizedRole,
            primary: brandIds[0],
            memberships: buildMemberships(brandIds, ['all']),
        };
    }

    if (normalizedRole === 'brand_user') {
        const merged = normalizeBrandIds([...normalizeBrandIds(brand_ids), normalizePrimaryBrand(primary_brand_id)]);
        if (merged.length !== 1) throw new Error('brand_user requires exactly one brand');
        const safePermissions = normalizePermissions(permissions);
        return {
            role: normalizedRole,
            primary: merged[0],
            memberships: buildMemberships(merged, safePermissions),
        };
    }

    const { brandIds, primary } = normalizeLegacyAssignment(brand_ids, primary_brand_id);
    return {
        role: normalizedRole,
        primary: primary || null,
        memberships: buildMemberships(brandIds, permissions),
    };
}

class AdminUserService {
    static async upsertUser({ email, role = 'viewer', brand_ids = [], primary_brand_id = null, status = 'active', permissions = ['all'] }) {
        const normalizedEmail = (email || '').toLowerCase();
        if (!normalizedEmail) throw new Error('email required');
        const assignment = await buildUserAssignment({ role, brand_ids, primary_brand_id, permissions });

        let user = await GlobalUser.findOne({ email: normalizedEmail });
        if (!user) {
            const password_hash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
            user = await GlobalUser.create({
                email: normalizedEmail,
                password_hash,
                status,
                role: assignment.role,
                primary_brand_id: assignment.primary || null,
                brand_memberships: assignment.memberships,
            });
        } else {
            user.role = assignment.role;
            user.status = status;
            if (assignment.primary) user.primary_brand_id = assignment.primary;
            user.brand_memberships = assignment.memberships;
            await user.save();
        }

        return user;
    }

    static async deleteUserByEmail(email) {
        const normalizedEmail = (email || '').toLowerCase();
        if (!normalizedEmail) throw new Error('email required');
        const result = await GlobalUser.deleteOne({ email: normalizedEmail });
        return result.deletedCount || 0;
    }

    static async listUsers() {
        const users = await GlobalUser.find({}, { password_hash: 0 }).lean();
        return users || [];
    }
}

module.exports = AdminUserService;
