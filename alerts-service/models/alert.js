const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  id: { type: Number, unique: true, required: true },
  brand_id: { type: Number, required: true, index: true },
  name: { type: String, required: true },
  metric_name: { type: String },
  metric_type: { type: String, enum: ['base', 'derived'], default: 'base' },
  formula: { type: String },
  threshold_type: { type: String, required: true },
  threshold_value: { type: Number, required: true },
  critical_threshold: { type: Number },
  severity: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
  cooldown_minutes: { type: Number, default: 30 },
  is_active: { type: Number, default: 1, index: true },
  created_at: { type: Date, default: () => new Date() },
  updated_at: { type: Date, default: () => new Date() },
  lookback_days: { type: Number },
  have_recipients: { type: Number, default: 0 },
  quiet_hours_start: { type: Number },
  quiet_hours_end: { type: Number },
  last_triggered_at: { type: Date },
}, { collection: 'alerts' });

alertSchema.index({ brand_id: 1, is_active: 1 });
alertSchema.pre('save', function(next) { this.updated_at = new Date(); next(); });
alertSchema.pre('findOneAndUpdate', function(next) { this.set({ updated_at: new Date() }); next(); });

module.exports = mongoose.model('Alert', alertSchema);
