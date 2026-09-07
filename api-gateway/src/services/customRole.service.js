const CustomRole = require('../models/CustomRole.model');
const GlobalUser = require('../models/GlobalUser.model');

function normalizeName(name) {
    return (name || '').toString().trim();
}

function normalizePermissions(permissions = []) {
    const list = Array.isArray(permissions) ? permissions : [];
    return [...new Set(list.map((p) => (p || '').toString().trim()).filter(Boolean))];
}

async function getAssignedUserCounts(roleIds = null) {
    const match = { custom_role_id: { $ne: null } };
    if (Array.isArray(roleIds)) match.custom_role_id = { $in: roleIds };
    const rows = await GlobalUser.aggregate([
        { $match: match },
        { $group: { _id: '$custom_role_id', count: { $sum: 1 } } },
    ]);
    const counts = new Map();
    for (const row of rows) counts.set(row._id, row.count);
    return counts;
}

class CustomRoleService {
    static async listRoles() {
        const roles = await CustomRole.find({}).sort({ created_at: 1 }).lean();
        const counts = await getAssignedUserCounts(roles.map((r) => r._id));
        return roles.map((role) => ({
            ...role,
            assigned_user_count: counts.get(role._id) || 0,
        }));
    }

    static async getRole(id) {
        if (!id) return null;
        const role = await CustomRole.findById(id).lean();
        if (!role) return null;
        const assigned_user_count = await GlobalUser.countDocuments({ custom_role_id: role._id });
        return { ...role, assigned_user_count };
    }

    static async createRole({ name, description = '', permissions = [], created_by = '' }) {
        const normalizedName = normalizeName(name);
        if (!normalizedName) throw new Error('role name required');
        const safePermissions = normalizePermissions(permissions);

        try {
            const role = await CustomRole.create({
                name: normalizedName,
                description: (description || '').toString().trim(),
                permissions: safePermissions,
                created_by,
            });
            return { ...role.toObject(), assigned_user_count: 0 };
        } catch (err) {
            if (err?.code === 11000) throw new Error('duplicate role name');
            throw err;
        }
    }

    static async updateRole(id, { name, description, permissions }) {
        const role = await CustomRole.findById(id);
        if (!role) throw new Error('role not found');

        if (name !== undefined) {
            const normalizedName = normalizeName(name);
            if (!normalizedName) throw new Error('role name required');
            role.name = normalizedName;
        }
        if (description !== undefined) role.description = (description || '').toString().trim();
        if (permissions !== undefined) role.permissions = normalizePermissions(permissions);

        try {
            await role.save();
        } catch (err) {
            if (err?.code === 11000) throw new Error('duplicate role name');
            throw err;
        }

        const assigned_user_count = await GlobalUser.countDocuments({ custom_role_id: role._id });
        return { ...role.toObject(), assigned_user_count };
    }

    static async deleteRole(id) {
        const assigned_user_count = await GlobalUser.countDocuments({ custom_role_id: id });
        if (assigned_user_count > 0) {
            const err = new Error('role in use');
            err.assigned_user_count = assigned_user_count;
            throw err;
        }
        const result = await CustomRole.deleteOne({ _id: id });
        if (!result.deletedCount) throw new Error('role not found');
        return true;
    }

    // Returns the role's permissions array if the user has a custom role
    // assigned, or null if they're in manual-permissions mode (no override).
    static async resolveEffectivePermissions(user) {
        const roleId = user?.custom_role_id;
        if (!roleId) return null;
        const role = await CustomRole.findById(roleId).lean();
        if (!role) {
            const logger = require('../utils/logger');
            logger.warn('CustomRoleService', 'Assigned custom role no longer exists', { roleId, userId: user?._id });
            return [];
        }
        return role.permissions || [];
    }
}

module.exports = CustomRoleService;
