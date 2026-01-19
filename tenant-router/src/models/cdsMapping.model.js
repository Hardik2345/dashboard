const mongoose = require('mongoose');

const cdsMappingSchema = new mongoose.Schema(
  {
    brand_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
  },
  {
    strict: false,
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

module.exports = mongoose.model('CdsMapping', cdsMappingSchema);
