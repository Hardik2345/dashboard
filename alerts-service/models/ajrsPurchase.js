const mongoose = require('mongoose');

const ajrsPurchaseSchema = new mongoose.Schema({
    order_id: { type: String, required: true },
    
}, {
    timestamps: true,
    collection: 'ajrsPurchase'
});

module.exports = mongoose.model('ajrsPurchase', ajrsPurchaseSchema);
