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

    // Check for idempotency key to prevent duplicates
    if (!sessionData.idempotency_key) {
      return res.status(400).json({ error: "idempotency_key is required" });
    }

    const existingSession = await Session.findOne({
      idempotency_key: sessionData.idempotency_key,
    });
    if (existingSession) {
      // Already processed this event, return success without saving again
      return res
        .status(200)
        .json({ message: "Event already processed", session: existingSession });
    }

    // Save new session document
    const session = new Session(sessionData);
    await session.save();

    res.status(201).json({ message: "Session tracked successfully", session });
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
    const direction = (evt.delta_percent || 0) < 0 ? "Drop" : "Rise";
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
    const body =
      evt.current_value !== undefined
        ? `current value: ${evt.current_value.toFixed(2)}`
        : evt.condition ||
          `${formattedMetric} ${direction.toLowerCase()} by ${delta}%`;

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

    const notifications = await mongoose.connection
      .collection("pushnotifications")
      .find({})
      .sort({ stored_at: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    // Also get unread count
    const unreadCount = await mongoose.connection
      .collection("pushnotifications")
      .countDocuments({ read: false });

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

    await mongoose.connection
      .collection("pushnotifications")
      .updateMany(query, { $set: { read: true } });
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
