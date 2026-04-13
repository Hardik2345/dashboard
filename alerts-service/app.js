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
const PipelineCreds = require("./models/pipelineCreds");
const { getPool } = require("./utils/db");


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

const redis = require("./utils/redis");

// Helper for Shopify GraphQL requests
async function shopifyGraphQL(shopName, accessToken, query, variables = {}) {
  const response = await fetch(`https://${shopName}.myshopify.com/admin/api/2024-04/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken
    },
    body: JSON.stringify({ query, variables })
  });
  const json = await response.json();
  if (json.errors) throw new Error(`Shopify GraphQL Error: ${JSON.stringify(json.errors)}`);
  return json.data;
}

// Background processing for inventory metrics
async function processInventoryMetrics(data) {
  const { 
    shopName, accessToken, productId, variantId, sku, 
    productTitle, variantTitle, inventoryQuantity, credsDoc 
  } = data;

  logger.info(`[inventory] Background process started for ${shopName} - ${productId}`);

  try {
    const now = new Date();
    const getDateString = (daysAgo) => {
      const d = new Date(now);
      d.setDate(d.getDate() - daysAgo);
      return d.toISOString().split("T")[0];
    };

    const date7 = getDateString(7);
    const date30 = getDateString(30);
    const date90 = getDateString(90);

    // 1. Fetch Sales (Paginated Loop for 90 Days)
    let sold7 = 0, sold30 = 0, sold90 = 0;
    let hasNextPage = true;
    let cursor = null;
    let pageCount = 0;

    // Use SKU filter to minimize order data fetching
    const ordersQuery = `
      query getOrders($query: String!, $cursor: String) {
        orders(first: 250, query: $query, after: $cursor, reverse: true) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              createdAt
              lineItems(first: 50) {
                edges {
                  node {
                    quantity
                    variant { id }
                    product { id }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const searchQuery = `created_at:>=${date90}${sku ? ` AND sku:${sku}` : ""}`;

    while (hasNextPage && pageCount < 50) {
      const ordersData = await shopifyGraphQL(shopName, accessToken, ordersQuery, { 
        query: searchQuery, 
        cursor 
      });
      
      const orders = ordersData.orders.edges;
      for (const edge of orders) {
        const order = edge.node;
        const orderDate = order.createdAt.split("T")[0];

        for (const lineEdge of order.lineItems.edges) {
          const item = lineEdge.node;
          if (item.variant?.id === variantId && item.product?.id === productId) {
            sold90 += item.quantity;
            if (orderDate >= date30) sold30 += item.quantity;
            if (orderDate >= date7) sold7 += item.quantity;
          }
        }
      }

      hasNextPage = ordersData.orders.pageInfo.hasNextPage;
      cursor = ordersData.orders.pageInfo.endCursor;
      pageCount++;
    }

    // 2. Fetch Current Inventory Quantity
    const productQuery = `
      query getProduct($id: ID!) {
        product(id: $id) {
          variants(first: 50) {
            edges {
              node {
                id
                inventoryQuantity
              }
            }
          }
        }
      }
    `;
    const productData = await shopifyGraphQL(shopName, accessToken, productQuery, { id: productId });
    const variantNode = productData.product.variants.edges.find(e => e.node.id === variantId);
    const liveQty = variantNode ? variantNode.node.inventoryQuantity : Number(inventoryQuantity);

    // 3. Calculate DRR and DOH
    const drr7 = (sold7 / 7) || 0;
    const drr30 = (sold30 / 30) || 0;
    const drr90 = (sold90 / 90) || 0;

    const doh7 = drr7 > 0 ? (liveQty / drr7) : 0;
    const doh30 = drr30 > 0 ? (liveQty / drr30) : 0;
    const doh90 = drr90 > 0 ? (liveQty / drr90) : 0;

    const newMetrics = {
      sold7, sold30, sold90,
      drr7: Number(drr7.toFixed(4)), 
      drr30: Number(drr30.toFixed(4)), 
      drr90: Number(drr90.toFixed(4)),
      doh7: Number(doh7.toFixed(4)), 
      doh30: Number(doh30.toFixed(4)), 
      doh90: Number(doh90.toFixed(4)),
      liveQty
    };

    // 4. Cache Check - Comparison
    const cacheKey = `inventory:cache:${shopName}:${variantId.split("/").pop()}`;
    const cachedData = await redis.get(cacheKey);
    
    if (cachedData) {
      const oldMetrics = JSON.parse(cachedData);
      // Remove non-metric fields for comparison
      const { 
        updatedAt: _u, date: _c, 
        productId: _p, productTitle: _pt, variantId: _v,
        ...oldCompare 
      } = oldMetrics;
      const isIdentical = JSON.stringify(newMetrics) === JSON.stringify(oldCompare);
      
      if (isIdentical) {
        logger.info(`[inventory] Metrics for ${shopName}-${variantId} are identical. Skipping MySQL update.`);
        return;
      }
    }

    // Add IST timestamps for storage
    const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    const istFormatted = istTime.toISOString().replace('Z', '').replace('T', ' ').substring(0, 19);
    const istDay = istTime.toISOString().split('T')[0];

    const finalMetrics = {
      ...newMetrics,
      productId,
      productTitle,
      variantId,
      updatedAt: istFormatted,
      date: istDay
    };

    // 5. Persistence - MySQL Upsert
    const dbPassword = PipelineCreds.decrypt(credsDoc.db_password);
    const pool = getPool({
      host: credsDoc.db_host,
      port: credsDoc.port,
      user: credsDoc.db_user,
      password: dbPassword,
      database: credsDoc.db_database
    });

    const numericProductId = (productId || "").split("/").pop();
    const numericVariantId = (variantId || "").split("/").pop();

    const upsertSql = `
      INSERT INTO top_products_inventory (
        product_id, product_title, variant_id, variant_title, sku, 
        inventory_available, sold_units_7d, sold_units_30d, sold_units_90d, 
        drr_7d, drr_30d, drr_90d, doh_7d, doh_30d, doh_90d, updated_at
      ) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE 
        product_title = VALUES(product_title),
        variant_title = VALUES(variant_title),
        sku = VALUES(sku),
        inventory_available = VALUES(inventory_available),
        sold_units_7d = VALUES(sold_units_7d),
        sold_units_30d = VALUES(sold_units_30d),
        sold_units_90d = VALUES(sold_units_90d),
        drr_7d = VALUES(drr_7d),
        drr_30d = VALUES(drr_30d),
        drr_90d = VALUES(drr_90d),
        doh_7d = VALUES(doh_7d),
        doh_30d = VALUES(doh_30d),
        doh_90d = VALUES(doh_90d),
        updated_at = NOW()
    `;

    await pool.query(upsertSql, [
      numericProductId, productTitle, numericVariantId, variantTitle, sku, 
      liveQty, sold7, sold30, sold90, 
      drr7, drr30, drr90, doh7, doh30, doh90
    ]);

    // Update Cache (7 Day TTL)
    await redis.set(cacheKey, JSON.stringify(finalMetrics), "EX", 7 * 24 * 60 * 60);
    logger.info(`[inventory] Successfully completed background processing for ${shopName} - ${productId}`);
  } catch (err) {
    logger.error(`[inventory] Background process failed for ${shopName}:`, err);
  }
}

app.post("/inventory", async (req, res) => {
  const pipelineKey = req.headers["x-pipeline-key"];
  if (pipelineKey !== process.env.X_PIPELINE_KEY) {
    return res.status(401).json({ error: "Unauthorized: Invalid Pipeline Key" });
  }

  const { shop_domain, product_id, product_title, variant_id, variant_title, sku, inventory_quantity } = req.body;
  
  if (!shop_domain || !product_id || !variant_id) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const shopName = shop_domain.replace(".myshopify.com", "");
  const variantNumericId = variant_id.split("/").pop();
  const lockKey = `inventory:lock:${shopName}:${variantNumericId}`;

  try {
    // 1. Rate Limiting Check (30 minutes)
    const isLocked = await redis.get(lockKey);
    if (isLocked) {
      logger.info(`[inventory] Request ignored (rate limited) for ${shopName}-${variantNumericId}`);
      return res.status(202).json({ message: "Request received but ignored due to 30-minute throttle window." });
    }

    // Set lock for 30 minutes
    await redis.set(lockKey, "1", "EX", 30 * 60);

    // 2. Fetch Credentials
    const archAuthDb = mongoose.connection.useDb("arch-auth", { useCache: true });
    const credsDoc = await archAuthDb
      .model("PipelineCreds", PipelineCreds.schema)
      .findOne({ shop_name: shopName })
      .lean();

    if (!credsDoc) {
      logger.error(`[inventory] Credentials not found for shop: ${shopName}`);
      return res.status(404).json({ error: "Credentials not found" });
    }

    const accessToken = PipelineCreds.decrypt(credsDoc.access_token);

    // Initial response
    res.status(202).json({ message: "Inventory metrics processing started in background." });

    // Start background processing
    processInventoryMetrics({
      shopName,
      accessToken,
      productId: product_id,
      variantId: variant_id,
      sku,
      productTitle: product_title,
      variantTitle: variant_title,
      inventoryQuantity: inventory_quantity,
      credsDoc
    }).catch(err => {
      logger.error("[inventory] Unhandled background process error:", err);
    });

  } catch (err) {
    logger.error("[inventory] Request handling error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
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
