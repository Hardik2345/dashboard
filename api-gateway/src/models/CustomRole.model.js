const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const { ALL_PERMISSIONS } = require('../constants/permissions');

// A Custom Role is nothing more than a reusable, named bundle of permissions
// — no brands, no primary brand, no user-specific configuration. Brands stay
// a property of the user (GlobalUser), never of the role.
const CustomRoleSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => randomUUID()
  },
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  description: {
    type: String,
    trim: true,
    default: ""
  },
  permissions: {
    type: [String],
    default: [],
    enum: ALL_PERMISSIONS,
  },
  created_by: {
    type: String,
    default: ""
  },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

CustomRoleSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('CustomRole', CustomRoleSchema);
