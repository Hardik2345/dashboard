const mongoose = require('mongoose');

const DomainRuleSchema = new mongoose.Schema({
  domain: {
    type: String,
    required: true,
    unique: true, // stored lowercase
  },
  role: {
    type: String,
    enum: ['author', 'viewer'],
    required: true,
    default: 'viewer',
  },
  primary_brand_id: {
    type: String,
    required: true,
  },
  brand_ids: {
    type: [String],
    default: [],
  },
  permissions: {
    type: [String],
    default: ['all'],
    enum: ['all', 'product_filter', 'utm_filter', 'web_vitals', 'payment_split_order', 'payment_split_sales'],
  },
  status: {
    type: String,
    enum: ['active', 'suspended'],
    default: 'active',
  },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

DomainRuleSchema.index({ domain: 1 }, { unique: true });
DomainRuleSchema.index({ domain: 1, status: 1 });

module.exports = mongoose.model('DomainRule', DomainRuleSchema);
