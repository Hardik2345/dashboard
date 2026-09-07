const mongoose = require('mongoose');

const alertChannelSchema = new mongoose.Schema({
  id: { type: Number, unique: true, required: true },
  alert_id: { type: Number, required: true, index: true },
  brand_id: { type: Number, required: true, index: true },
  channel_type: { type: String, enum: ['slack', 'email', 'webhook'], required: true },
  channel_config: { type: mongoose.Schema.Types.Mixed, required: true },
}, { collection: 'alert_channels', timestamps: false });

alertChannelSchema.index({ alert_id: 1, channel_type: 1 });

module.exports = mongoose.model('AlertChannel', alertChannelSchema);
