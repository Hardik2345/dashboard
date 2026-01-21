const GlobalUser = require('../models/GlobalUser.model');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

function normalizeBrands(brand_ids = [], primary_brand_id = null) {
    const brandIds = Array.isArray(brand_ids) ? [...new Set(brand_ids.map(b => (b || '').toUpperCase()).filter(Boolean))] : [];
    let primary = primary_brand_id ? primary_brand_id.toUpperCase() : null;
    if (primary && !brandIds.includes(primary)) brandIds.push(primary);
    return { brandIds, primary };
}

class AdminUserService {
    static async upsertUser({ email, role = 'viewer', brand_ids = [], primary_brand_id = null, status = 'active', permissions = ['all'] }) {
        const normalizedEmail = (email || '').toLowerCase();
        if (!normalizedEmail) throw new Error('email required');
        if (!['author', 'viewer'].includes(role)) throw new Error('invalid role');

        const { brandIds, primary } = normalizeBrands(brand_ids, primary_brand_id);
        const memberships = brandIds.map(bid => ({
            brand_id: bid,
            status: 'active',
            permissions
        }));

        let user = await GlobalUser.findOne({ email: normalizedEmail });
        if (!user) {
            const password_hash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
            user = await GlobalUser.create({
                email: normalizedEmail,
                password_hash,
                status,
                role,
                primary_brand_id: primary || null,
                brand_memberships: memberships,
            });
        } else {
            user.role = role;
            user.status = status;
            if (primary) user.primary_brand_id = primary;
            user.brand_memberships = memberships;
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
