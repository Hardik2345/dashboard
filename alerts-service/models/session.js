const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    event_id: { type: String, required: true },
    idempotency_key: { type: String, unique: true, required: true },
    event_type: {
        type: String,
        enum: ['add_to_cart', 'checkout_initiated'],
        required: true
    },
    session_id: { type: String, required: true },
    cart_token: { type: String },
    checkout_token: { type: String },
    user_agent: { type: String }
}, {
    timestamps: true,
    collection: 'sessions'
});

module.exports = mongoose.model('Session', sessionSchema);
