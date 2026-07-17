const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    event_id: { type: String, required: true },
    idempotency_key: { type: String, unique: true, required: true },
    event_type: {
      type: String,
      enum: [
        "add_to_cart",
        "checkout_initiated",
        "buy_now",
        "page_viewed",
        "add_to_cart_rs",
        "video_open",
        "video_add_to_cart_click",
        "video_more_info",
        "video_close",
        "carrousel_view"
      ],
      required: true,
    },
    session_id: { type: String, required: true },
    variantId: { type: String },
    shop_name: { type: String },
    cart_token: { type: String },
    checkout_token: { type: String },
    user_agent: { type: String },
    url: { type: String },
  },
  {
    timestamps: true,
    collection: "sessions",
  },
);

sessionSchema.index(
  { session_id: 1 },
  {
    name: "unique_session_id_for_checkout_events",
    unique: true,
    partialFilterExpression: {
      event_type: { $in: ["checkout_initiated", "buy_now"] },
      session_id: { $exists: true, $type: "string" },
    },
  },
);

module.exports = mongoose.model("Session", sessionSchema);
