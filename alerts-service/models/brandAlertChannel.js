const mongoose = require('mongoose');

const brandAlertChannelSchema = new mongoose.Schema({
  id: { type: Number, unique: true, required: true },
  brand_id: { type: Number, required: true, unique: true, index: true },
  channel_type: { type: String, enum: ['slack', 'email', 'webhook'], required: true },
  channel_config: { type: mongoose.Schema.Types.Mixed, required: true },
  is_active: { type: Number, default: 1, index: true },
  created_at: { type: Date, default: () => new Date() },
  updated_at: { type: Date, default: () => new Date() },
}, { collection: 'brands_alert_channel', timestamps: false });

brandAlertChannelSchema.index({ brand_id: 1, channel_type: 1 });
brandAlertChannelSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updated_at: new Date() });
  next();
});

module.exports = mongoose.model('BrandAlertChannel', brandAlertChannelSchema);
