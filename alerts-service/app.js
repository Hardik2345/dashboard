require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");

const logger = require("./utils/logger");
const { getBrands } = require("./config/brands");
const { buildAlertsRouter } = require("./routes/alerts");
const { requireAuthor } = require("./middlewares/auth");
const { getNextSeq } = require("./utils/counters");
const {
  buildAlertConfigEventPublisher,
} = require("./services/alertConfigEventPublisher");
const Alert = require("./models/alert");
const AlertChannel = require("./models/alertChannel");
const BrandAlertChannel = require("./models/brandAlertChannel");
const OtpVerified = require("./models/otpVerified");
const AjrsPurchase = require("./models/ajrsPurchase");
const ItemQtyPush = require("./models/itemQtyPush");
const { sendToAll } = require("./utils/fcm");


const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// --- Mongo Connection --------------------------------------------------------
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const MONGO_DB = process.env.MONGO_DB || "alerts";

mongoose.set("strictQuery", true);

// ---- Routes -----------------------------------------------------------------
const alertConfigEventPublisher = buildAlertConfigEventPublisher();

app.get("/health", (_req, res) => res.json({ ok: true }));
app.post("/inventory", (req, res) => {
  const pipelineKey = req.headers["x-pipeline-key"];
  const correctKey = process.env.X_PIPELINE_KEY;

  if (!pipelineKey || pipelineKey !== correctKey) {
    logger.warn(`[inventory] Unauthorized access attempt with key: ${pipelineKey}`);
    return res.status(401).json({ error: "Unauthorized" });
  }

  logger.info("[inventory] Received inventory update:", req.body);
  // Log full received body on console as requested
  console.log("Full Received Body:", JSON.stringify(req.body, null, 2));

  res.status(200).json({ message: "Inventory received successfully" });
});
app.use(
  "/alerts",
  requireAuthor,
  buildAlertsRouter({
    Alert,
    AlertChannel,
    BrandAlertChannel,
    getNextSeq,
    alertConfigEventPublisher,
  }),
);
const Session = require("./models/session");

app.post("/track", async (req, res) => {
  try {
    const sessionData = req.body;
    const isRSEvent = sessionData.tags === "RS_Cinema_KP" || sessionData.orderId;

    // Check for idempotency key to prevent duplicates (bypass for custom RS events)
    if (!sessionData.idempotency_key && !isRSEvent) {
      return res.status(400).json({ error: "idempotency_key is required" });
    }

    let existingSession = null;
    if (sessionData.idempotency_key) {
      existingSession = await Session.findOne({
        idempotency_key: sessionData.idempotency_key,
      });
    }

    if (existingSession) {
      return res
        .status(200)
        .json({ message: "Event already processed", session: existingSession });
    }

    // ---- RS Specific Event Handling ----
    if (isRSEvent) {
      if (sessionData.tags === "RS_Cinema_KP" && sessionData.customer_id) {
        const exists = await OtpVerified.findOne({ customer_id: sessionData.customer_id });
        if (!exists) {
          const otpVerify = new OtpVerified({ customer_id: sessionData.customer_id });
          await otpVerify.save();
          logger.info(`[track] OTP Verified saved for customer: ${sessionData.customer_id}`);
        }
      }

      if (sessionData.orderId) {
        const exists = await AjrsPurchase.findOne({ order_id: sessionData.orderId });
        if (!exists) {
          const purchase = new AjrsPurchase({ order_id: sessionData.orderId });
          await purchase.save();
          logger.info(`[track] AJRS Purchase saved for order: ${sessionData.orderId}`);
        }
      }

      return res.status(201).json({ message: "Session tracked successfully" });
    }

    // Save new session document
    const session = new Session(sessionData);
    await session.save();

  } catch (err) {

    logger.error("Error tracking session:", err);
    res.status(500).json({ error: "Failed to track alert" });
  }
});

app.post("/push/receive", async (req, res) => {
  try {
    logger.info("[push/receive] Received push notification:", req.body);
    if (
      !req.headers["x-push-token"] ||
      req.headers["x-push-token"] !== process.env.PUSH_TOKEN
    ) {
      return res
        .status(401)
        .json({ error: "Unauthorized", message: "push token is required" });
    }

    const payload = { ...req.body };

    // --- Detect Item Quantity Push ---
    if (payload.product_id && payload.current_quantity !== undefined) {
      const itemQtyEvent = new ItemQtyPush(payload);
      await itemQtyEvent.save();

      const subject = `🚨Inventory update: **${payload.product_title}** | ${payload.previous_quantity} -> ${payload.current_quantity}`;
      const description = `**${payload.product_title} (${payload.variant_title})** stock dropped from ${payload.previous_quantity} to ${payload.current_quantity} units`;

      sendToAll(mongoose.connection, subject, description, {
        brand: payload.brand || "System",
      }).catch((err) =>
        logger.error("[push/receive] FCM sendToAll error (ItemQtyPush):", err.message)
      );

      return res.json({
        message: "Item quantity push notification received and stored successfully",
        data: payload,
      });
    }

    const evt = payload.event || {};

    // --- Performance Alert Guard (Comment out to restore) ---
    if (evt.metric === "performance") {
      logger.info("[push/receive] Skipping performance alert as requested.");
      return res.json({
        message: "Performance alert skipped",
        data: payload,
      });
    }
    // --------------------------------------------------------

    // Store in pushnotifications collection
    await mongoose.connection.collection("pushnotifications").insertOne({
      ...payload,
      read: false,
      stored_at: new Date(),
    });

    // Extract hour range from email body (e.g., "0-17h")
    const emailContent =
      typeof payload.email_body === "string"
        ? payload.email_body
        : payload.email_body?.html || "";
    const hourMatch = emailContent.match(/(\d+-\d+h)/);
    const hourRange = hourMatch ? hourMatch[1] : "";

    // Build FCM notification headline
    const delta = Math.abs(evt.delta_percent || 0).toFixed(2);
    const thresholdType = String(evt.threshold_type || "").toLowerCase();
    const eventDirection = String(evt.direction || "").toLowerCase();
    const conditionText = String(evt.condition || "").toLowerCase();

    const direction =
      eventDirection.includes("below") ||
      eventDirection.includes("drop") ||
      eventDirection.includes("down") ||
      eventDirection.includes("decrease") ||
      conditionText.includes("drop") ||
      conditionText.includes("below") ||
      thresholdType.includes("drop") ||
      thresholdType.includes("less_than")
        ? "Drop"
        : eventDirection.includes("above") ||
          eventDirection.includes("rise") ||
          eventDirection.includes("up") ||
          eventDirection.includes("increase") ||
          conditionText.includes("rise") ||
          conditionText.includes("above") ||
          thresholdType.includes("rise") ||
          thresholdType.includes("greater_than")
        ? "Rise"
        : (evt.delta_percent || 0) < 0
        ? "Drop"
        : "Rise";
    const rawMetric = evt.metric || "metric";
    const formattedMetric = rawMetric
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    const brand = evt.brand || "System";
    const currentValue =
      evt.current_value !== undefined ? evt.current_value.toFixed(2) : "0.00";

    // New Title Format: NEULIFE | Low Speed Alert | 50.00 | 3.85% Drop | 0-17h
    const titleParts = [
      brand,
      formattedMetric,
      currentValue,
      `${delta}% ${direction}`,
    ];
    if (hourRange) titleParts.push(hourRange);
    const title = titleParts.join(" | ");

    // Updated body to show current value if available
    let body;
    if (evt.current_value !== undefined) {
      body = `current value: ${evt.current_value.toFixed(2)}`;
      evt.condition = body;
    } else {
      body = evt.condition || `${formattedMetric} ${direction.toLowerCase()} by ${delta}%`;
      evt.condition = `${formattedMetric} ${direction.toLowerCase()} by ${delta}%`;
    }

    // Send FCM push to all registered devices (fire-and-forget)
    sendToAll(mongoose.connection, title, body, {
      event_id: evt.event_id || "",
      severity: evt.severity || "info",
      brand: brand,
    }).catch((err) =>
      logger.error("[push/receive] FCM sendToAll error:", err.message),
    );

    res.json({
      message: "Push notification received and stored successfully",
      data: payload,
    });
  } catch (err) {
    logger.error("Error logging push notification:", err);
    res.status(500).json({ error: "Failed to log push notification" });
  }
});

app.post("/push/register-token", requireAuthor, async (req, res) => {
  try {
    const { token, user_info } = req.body;
    if (!token) return res.status(400).json({ error: "FCM token is required" });

    await mongoose.connection
      .collection("fcm_tokens")
      .updateOne(
        { token },
        { $set: { token, user_info, updated_at: new Date() } },
        { upsert: true },
      );

    res.json({ message: "Token registered successfully" });
  } catch (err) {
    logger.error("Error registering FCM token:", err);
    res.status(500).json({ error: "Failed to register token" });
  }
});

app.post("/push/unregister-token", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "FCM token is required" });

    await mongoose.connection.collection("fcm_tokens").deleteOne({ token });

    res.json({ message: "Token unregistered successfully" });
  } catch (err) {
    logger.error("Error unregistering FCM token:", err);
    res.status(500).json({ error: "Failed to unregister token" });
  }
});

app.get("/push/notifications", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = parseInt(req.query.skip, 10) || 0;

    const pushNotifs = await mongoose.connection
      .collection("pushnotifications")
      .find({})
      .sort({ stored_at: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const itemQtyNotifs = await mongoose.connection
      .collection("item_qty_push")
      .find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const formattedItemQty = itemQtyNotifs.map((reqPush) => {
      const diff = (reqPush.previous_quantity || 0) - (reqPush.current_quantity || 0);
      const pct = reqPush.previous_quantity ? (diff / reqPush.previous_quantity) * 100 : 0;
      return {
        _id: reqPush._id,
        stored_at: reqPush.createdAt,
        read: reqPush.read || false,
        is_item_qty_push: true,
        event: {
          metric: reqPush.variant_title || "Quantity",
          delta_percent: -pct, // negative for drop
          threshold_type: "drop",
          direction: "drop",
          condition: `Stock dropped to ${reqPush.current_quantity}`,
          current_state: "CRITICAL",
          brand: reqPush.product_title || "Inventory",
          current_value: reqPush.current_quantity,
          previous_quantity: reqPush.previous_quantity,
        },
      };
    });

    let combined = [...pushNotifs, ...formattedItemQty];
    combined.sort((a, b) => new Date(b.stored_at) - new Date(a.stored_at));
    const notifications = combined.slice(0, limit);

    // Also get unread count
    const unreadPushNotifs = await mongoose.connection
      .collection("pushnotifications")
      .countDocuments({ read: false });

    const unreadItemQty = await mongoose.connection
      .collection("item_qty_push")
      .countDocuments({ read: false });

    const unreadCount = unreadPushNotifs + unreadItemQty;

    res.json({ notifications, unreadCount });
  } catch (err) {
    logger.error("Error fetching notifications:", err);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

app.put("/push/notifications/read", async (req, res) => {
  try {
    const { message_ids } = req.body;

    let query = { read: false };
    if (message_ids && Array.isArray(message_ids) && message_ids.length > 0) {
      const objectIds = message_ids.map((id) => {
        try {
          return new mongoose.Types.ObjectId(id);
        } catch (e) {
          return id;
        }
      });
      query = { _id: { $in: objectIds } };
    }

    await Promise.all([
      mongoose.connection
        .collection("pushnotifications")
        .updateMany(query, { $set: { read: true } }),
      mongoose.connection
        .collection("item_qty_push")
        .updateMany(query, { $set: { read: true } }),
    ]);
    res.json({ message: "Notifications marked as read" });
  } catch (err) {
    logger.error("Error marking notifications as read:", err);
    res.status(500).json({ error: "Failed to update notifications" });
  }
});

// ---- Start ------------------------------------------------------------------
async function start() {
  try {
    await mongoose.connect(MONGO_URI, { dbName: MONGO_DB });
    logger.info("[alerts-service] Mongo connected");
    const port = Number(process.env.PORT || 5005);
    app.listen(port, () => {
      logger.info(`[alerts-service] listening on :${port}`);
      logger.info(
        "[alerts-service] brands loaded:",
        Object.keys(getBrands()).join(", ") || "(none)",
      );
    });
  } catch (err) {
    console.error("Failed to start alerts-service", err);
    process.exit(1);
  }
}

start();

module.exports = { app, mongoose, Alert, AlertChannel, BrandAlertChannel };
