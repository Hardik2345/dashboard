const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const RefreshTokenSchema = new mongoose.Schema({
    _id: {
        type: String,
        default: () => randomUUID()
    },
    user_id: {
        type: String,
        required: true,
        ref: 'GlobalUser'
    },
    device_id: {
        type: String,
        default: null
    },
    token_hash: {
        type: String,
        required: true
    },
    expires_at: {
        type: Date,
        required: true
    },
    revoked: {
        type: Boolean,
        default: false
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    rotated_from: {
        type: String,
        default: null,
        ref: 'RefreshToken'
    }
});

// Index for quick lookup by token_hash or validation
RefreshTokenSchema.index({ token_hash: 1 });
RefreshTokenSchema.index({ user_id: 1 });

module.exports = mongoose.model('RefreshToken', RefreshTokenSchema);
