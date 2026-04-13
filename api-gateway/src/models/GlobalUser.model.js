const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const BrandMembershipSchema = new mongoose.Schema({
  brand_id: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'suspended'],
    required: true,
    default: 'active'
  },
  permissions: {
    type: [String],
    default: ["all"],
    enum: [
      "all",
      "product_filter",
      "utm_filter",
      "web_vitals",
      "payment_split_order",
      "payment_split_sales",
      "traffic_split",
      "sales_channel_filter",
      "device_type_filter",
      "sessions_drop_off_funnel",
      "product_conversion",
      "compare_mode",
      "product_conversion:landing_page_path",
      "product_conversion:sessions",
      "product_conversion:atc",
      "product_conversion:atc_rate",
      "product_conversion:orders",
      "product_conversion:sales",
      "product_conversion:cvr",
      "product_conversion:drr",
      "product_conversion:doh",
      "product_table_filters",
      "product_table_filters:inventory",
      "product_table_filters:page_type",
      "product_table_filters:product_types",
      "product_table_filters:sort_filter",
    ],
  }
}, { _id: false });

const GlobalUserSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => randomUUID()
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password_hash: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'deleted'],
    default: 'active'
  },
  primary_brand_id: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['author', 'viewer'],
    default: 'viewer'
  },
  brand_memberships: {
    type: [BrandMembershipSchema],
    default: []
  },
  audit: {
    version: {
      type: Number,
      default: 1
    }
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

GlobalUserSchema.index({ email: 1 }, { unique: true });
GlobalUserSchema.index({ primary_brand_id: 1 });
GlobalUserSchema.index({ role: 1 });

module.exports = mongoose.model('GlobalUser', GlobalUserSchema);
