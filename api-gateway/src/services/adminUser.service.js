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
const CustomRoleService = require('./customRole.service');

function normalizeEmail(email) {
    return (email || '').toString().trim().toLowerCase();
}

function isValidEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || normalizedEmail.length > 254) return false;
    if (normalizedEmail.includes('..')) return false;

    const parts = normalizedEmail.split('@');
    if (parts.length !== 2) return false;

    const [localPart, domainPart] = parts;
    if (!localPart || !domainPart) return false;
    if (localPart.startsWith('.') || localPart.endsWith('.')) return false;
    if (domainPart.startsWith('.') || domainPart.endsWith('.')) return false;
    if (!domainPart.includes('.')) return false;

    return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(normalizedEmail);
}

async function findUsersByNormalizedEmail(normalizedEmail) {
    if (!normalizedEmail) return [];
    return GlobalUser.find({
        $expr: {
            $eq: [
                { $toLower: { $trim: { input: '$email' } } },
                normalizedEmail,
            ],
        },
    }).sort({ created_at: 1 });
}

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

async function buildUserAssignment({ role, brand_ids = [], primary_brand_id = null, permissions = DEFAULT_PERMISSIONS, customRoleId = null }) {
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

    // Custom Role mode only applies to viewer/brand_user — author/super_admin
    // already hardcode permissions:['all'] and have no manual-permissions UI,
    // so a role assignment there would be meaningless; ignore it.
    const effectivePermissions = customRoleId ? [] : permissions;

    if (normalizedRole === 'brand_user') {
        const merged = normalizeBrandIds([...normalizeBrandIds(brand_ids), normalizePrimaryBrand(primary_brand_id)]);
        if (merged.length !== 1) throw new Error('brand_user requires exactly one brand');
        const safePermissions = customRoleId ? [] : normalizePermissions(permissions);
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
        memberships: buildMemberships(brandIds, effectivePermissions),
    };
}

class AdminUserService {
    static async upsertUser({ name = '', email, role = 'viewer', brand_ids = [], primary_brand_id = null, status = 'active', permissions = ['all'], customRoleId = null, createOnly = false }) {
        const normalizedEmail = normalizeEmail(email);
        const normalizedName = (name || '').toString().trim();
        if (!normalizedEmail) throw new Error('email required');
        if (!isValidEmail(normalizedEmail)) throw new Error('invalid email format');

        const normalizedCustomRoleId = (customRoleId || '').toString().trim() || null;
        if (normalizedCustomRoleId) {
            const customRole = await CustomRoleService.getRole(normalizedCustomRoleId);
            if (!customRole) throw new Error('invalid custom role');
        }

        const assignment = await buildUserAssignment({ role, brand_ids, primary_brand_id, permissions, customRoleId: normalizedCustomRoleId });

        const matchingUsers = await findUsersByNormalizedEmail(normalizedEmail);
        if (matchingUsers.length > 1) {
            throw new Error('duplicate email exists');
        }

        let user = matchingUsers[0] || null;
        if (!user) {
            const password_hash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
            try {
                user = await GlobalUser.create({
                    email: normalizedEmail,
                    name: normalizedName,
                    password_hash,
                    status,
                    role: assignment.role,
                    primary_brand_id: assignment.primary || null,
                    brand_memberships: assignment.memberships,
                    custom_role_id: normalizedCustomRoleId,
                });
            } catch (err) {
                if (err?.code === 11000) {
                    throw new Error('duplicate email exists');
                }
                throw err;
            }
        } else {
            if (createOnly) {
                throw new Error('duplicate email exists');
            }
            user.email = normalizedEmail;
            user.name = normalizedName;
            user.role = assignment.role;
            user.status = status;
            if (assignment.primary) user.primary_brand_id = assignment.primary;
            user.brand_memberships = assignment.memberships;
            user.custom_role_id = normalizedCustomRoleId;
            try {
                await user.save();
            } catch (err) {
                if (err?.code === 11000) {
                    throw new Error('duplicate email exists');
                }
                throw err;
            }
        }

        return user;
    }

    static async deleteUserByEmail(email) {
        const normalizedEmail = normalizeEmail(email);
        if (!normalizedEmail) throw new Error('email required');
        const result = await GlobalUser.deleteMany({
            $expr: {
                $eq: [
                    { $toLower: { $trim: { input: '$email' } } },
                    normalizedEmail,
                ],
            },
        });
        return result.deletedCount || 0;
    }

    static async listUsers() {
        const users = await GlobalUser.find({}, { password_hash: 0 }).lean();
        return users || [];
    }
}

module.exports = AdminUserService;
