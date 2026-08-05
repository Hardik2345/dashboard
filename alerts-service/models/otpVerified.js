const mongoose = require('mongoose');

const otpVerifiedSchema = new mongoose.Schema({
    customer_id: { type: String, required: true },
}, {
    timestamps: true,
    collection: 'ajrs_otpverified'
});

module.exports = mongoose.model('ajrs_otpverified', otpVerifiedSchema);
