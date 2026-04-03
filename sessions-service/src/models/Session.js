const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    index: true
  },
  startedAt: {
    type: Date,
    required: true,
    index: true
  },
  brand: {
    type: String,
    default: null
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  userAgent: {
    type: String
  },
  platform: {
    type: String
  },
  screenWidth: {
    type: Number
  },
  screenHeight: {
    type: Number
  },
  timezone: {
    type: String
  },
  ipAddress: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index to help with the 30-minute window check: userId + startedAt (desc)
sessionSchema.index({ userId: 1, startedAt: -1 });

module.exports = mongoose.model('Session', sessionSchema);
