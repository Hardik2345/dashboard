const DomainRule = require('../models/DomainRule.model');

function normalizeDomain(domain) {
  const d = (domain || '').toLowerCase().trim();
  if (!d || !d.includes('.')) throw new Error('invalid domain');
  return d;
}

function normalizeBrands(brand_ids = [], primary_brand_id = null, role = 'viewer') {
  const brandIds = Array.isArray(brand_ids) ? [...new Set(brand_ids.map(b => (b || '').toUpperCase()).filter(Boolean))] : [];
  let primary = primary_brand_id ? primary_brand_id.toUpperCase() : null;
  if (!primary) throw new Error('primary_brand_id required');
  if (!brandIds.includes(primary)) brandIds.push(primary);
  if (role === 'author' && brandIds.length === 0) brandIds.push(primary);
  return { brandIds, primary };
}

class AdminDomainRuleService {
  static async upsertRule({ domain, role = 'viewer', primary_brand_id, brand_ids = [], permissions = ['all'], status = 'active' }) {
    const normalizedDomain = normalizeDomain(domain);
    if (!['author', 'viewer'].includes(role)) throw new Error('invalid role');
    const { brandIds, primary } = normalizeBrands(brand_ids, primary_brand_id, role);
    const safePermissions = role === 'author' ? ['all'] : (permissions && permissions.length ? permissions : ['all']);

    const update = {
      domain: normalizedDomain,
      role,
      primary_brand_id: primary,
      brand_ids: brandIds,
      permissions: safePermissions,
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
