const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const { AUTH_ROLES } = require('../services/rbac.service');
const { ALL_PERMISSIONS } = require('../constants/permissions');

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
    enum: ALL_PERMISSIONS,
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
    unique: true,
    trim: true,
    lowercase: true
  },
  name: {
    type: String,
    trim: true,
    default: ""
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
    enum: AUTH_ROLES,
    default: 'viewer'
  },
  // Reusable permission bundle. When set, this is the SOLE source of the
  // user's effective permissions (resolved dynamically at auth time in
  // AuthService.filterUserToActiveTenants) — brand_memberships[].permissions
  // is left untouched/historical so switching back to manual restores it.
  custom_role_id: {
    type: String,
    default: null
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
GlobalUserSchema.index({ custom_role_id: 1 });

module.exports = mongoose.model('GlobalUser', GlobalUserSchema);
