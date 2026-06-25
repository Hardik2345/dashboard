const DomainRule = require('../models/DomainRule.model');
const {
  AUTH_ROLES,
  DEFAULT_PERMISSIONS,
  fetchAllBrandIds,
  normalizeBrandIds,
  normalizePermissions,
  normalizePrimaryBrand,
  normalizeRole,
} = require('./rbac.service');

function normalizeDomain(domain) {
  const d = (domain || '').toLowerCase().trim();
  if (!d || !d.includes('.')) throw new Error('invalid domain');
  return d;
}

function normalizeLegacyAssignment(brand_ids = [], primary_brand_id = null, role = 'viewer') {
  const brandIds = normalizeBrandIds(brand_ids);
  let primary = normalizePrimaryBrand(primary_brand_id);
  if (!primary) throw new Error('primary_brand_id required');
  if (!brandIds.includes(primary)) brandIds.push(primary);
  if (role === 'author' && brandIds.length === 0) brandIds.push(primary);
  return { brandIds, primary };
}

async function buildRuleAssignment({ role, brand_ids = [], primary_brand_id = null, permissions = DEFAULT_PERMISSIONS }) {
  const normalizedRole = normalizeRole(role);

  if (!AUTH_ROLES.includes(normalizedRole)) throw new Error('invalid role');

  if (normalizedRole === 'super_admin') {
    const brandIds = await fetchAllBrandIds();
    return {
      role: normalizedRole,
      primary: brandIds[0],
      brandIds,
      permissions: ['all'],
    };
  }

  if (normalizedRole === 'brand_user') {
    const merged = normalizeBrandIds([...normalizeBrandIds(brand_ids), normalizePrimaryBrand(primary_brand_id)]);
    if (merged.length !== 1) throw new Error('brand_user requires exactly one brand');
    return {
      role: normalizedRole,
      primary: merged[0],
      brandIds: merged,
      permissions: normalizePermissions(permissions),
    };
  }

  const { brandIds, primary } = normalizeLegacyAssignment(brand_ids, primary_brand_id, normalizedRole);
  return {
    role: normalizedRole,
    primary,
    brandIds,
    permissions: normalizedRole === 'author' ? ['all'] : (permissions && permissions.length ? permissions : ['all']),
  };
}

class AdminDomainRuleService {
  static async upsertRule({ domain, role = 'viewer', primary_brand_id, brand_ids = [], permissions = ['all'], status = 'active' }) {
    const normalizedDomain = normalizeDomain(domain);
    const assignment = await buildRuleAssignment({ role, brand_ids, primary_brand_id, permissions });

    const update = {
      domain: normalizedDomain,
      role: assignment.role,
      primary_brand_id: assignment.primary,
      brand_ids: assignment.brandIds,
      permissions: assignment.permissions,
      status: status || 'active',
    };

    const rule = await DomainRule.findOneAndUpdate(
      { domain: normalizedDomain },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return rule;
  }

  static async listRules() {
    return DomainRule.find({}).lean();
  }

  static async deleteRule(domain) {
    const normalizedDomain = normalizeDomain(domain);
    const res = await DomainRule.deleteOne({ domain: normalizedDomain });
    return res.deletedCount || 0;
  }

  static async findActiveRuleForEmail(email) {
    const normalizedEmail = (email || '').toLowerCase();
    const parts = normalizedEmail.split('@');
    if (parts.length !== 2) return null;
    const domain = parts[1];
    const rule = await DomainRule.findOne({ domain, status: 'active' }).lean();
    return rule;
  }
}

module.exports = AdminDomainRuleService;
