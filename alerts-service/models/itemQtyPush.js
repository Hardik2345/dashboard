const mongoose = require("mongoose");

const itemQtyPushSchema = new mongoose.Schema(
  {
    product_id: { type: String, required: true },
    product_title: { type: String, required: true },
    variant_id: { type: String, required: true },
    variant_title: { type: String, required: true },
    sku: { type: String, required: true },
    previous_quantity: { type: Number, required: true },
    current_quantity: { type: Number, required: true },
    read: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    collection: "item_qty_push"
  }
);

module.exports = mongoose.model("ItemQtyPush", itemQtyPushSchema);
