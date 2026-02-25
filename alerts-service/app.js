require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');

const logger = require('./utils/logger');
const { getBrands } = require('./config/brands');
const { buildAlertsRouter } = require('./routes/alerts');
const { requireAuthor } = require('./middlewares/auth');
const { getNextSeq } = require('./utils/counters');
const { sendToAll } = require('./utils/firebaseAdmin');
const Alert = require('./models/alert');
const AlertChannel = require('./models/alertChannel');
const BrandAlertChannel = require('./models/brandAlertChannel');
const { ObjectId } = require('mongoose').Types;

const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// --- Mongo Connection --------------------------------------------------------
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const MONGO_DB = process.env.MONGO_DB || 'alerts';

mongoose.set('strictQuery', true);

// ---- Routes -----------------------------------------------------------------
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/alerts', requireAuthor, buildAlertsRouter({ Alert, AlertChannel, BrandAlertChannel, getNextSeq }));


app.post('/push/receive', async (req, res) => {
  try {
    if (!req.headers['x-push-token'] || req.headers['x-push-token'] !== process.env.PUSH_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized', message: 'push token is required' });
    }

    const payload = { ...req.body };
    delete payload.email_body;

    // Store in pushnotifications collection
    await mongoose.connection.collection('pushnotifications').insertOne({
      ...payload,
      read: false,
      stored_at: new Date()
    });

    // Build FCM notification headline
    const evt = payload.event || {};
    const delta = Math.abs(evt.delta_percent || 0).toFixed(2);
    const direction = (evt.delta_percent || 0) < 0 ? 'Dropped' : 'Rose';
    const metric = (evt.metric || 'metric').replace(/_/g, ' ');
    const state = evt.current_state || 'ALERT';
    const brand = evt.brand || '';
    const title = `${state}: ${metric} ${direction} by ${delta}% | ${brand}`;
    const body = evt.condition || `${metric} ${direction.toLowerCase()} by ${delta}%`;

    // Send FCM push to all registered devices (fire-and-forget)
    sendToAll(mongoose.connection, title, body, {
      event_id: evt.event_id || '',
      severity: evt.severity || 'info',
      brand: brand,
    }).catch(err => logger.error('[push/receive] FCM sendToAll error:', err.message));

    res.json({ message: 'Push notification received and stored successfully', data: payload });
  } catch (err) {
    logger.error('Error logging push notification:', err);
    res.status(500).json({ error: 'Failed to log push notification' });
  }
});

// ---- Register FCM device token ----------------------------------------------
app.post('/push/register-token', async (req, res) => {
  try {
    const { token, role } = req.body;
    if (!token) return res.status(400).json({ error: 'token is required' });

    await mongoose.connection.collection('fcm_tokens').updateOne(
      { token },
      { $set: { token, role: role || 'user', updated_at: new Date() }, $setOnInsert: { created_at: new Date() } },
      { upsert: true }
    );

    res.json({ message: 'Token registered' });
  } catch (err) {
    logger.error('Error registering FCM token:', err);
    res.status(500).json({ error: 'Failed to register token' });
  }
});

// ---- Notification history ---------------------------------------------------
app.get('/push/notifications', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const docs = await mongoose.connection.collection('pushnotifications')
      .find({})
      .sort({ stored_at: -1 })
      .limit(limit)
      .toArray();

    const unreadCount = await mongoose.connection.collection('pushnotifications')
      .countDocuments({ read: { $ne: true } });

    res.json({ notifications: docs, unread_count: unreadCount });
  } catch (err) {
    logger.error('Error fetching notifications:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// ---- Mark notifications as read ---------------------------------------------
app.post('/push/notifications/mark-read', async (req, res) => {
  try {
    const { ids } = req.body; // array of _id strings, or empty to mark all
    const filter = ids && ids.length
      ? { _id: { $in: ids.map(id => new ObjectId(id)) } }
      : {};

    await mongoose.connection.collection('pushnotifications').updateMany(
      filter,
      { $set: { read: true } }
    );

    res.json({ message: 'Marked as read' });
  } catch (err) {
    logger.error('Error marking notifications read:', err);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// ---- Start ------------------------------------------------------------------
async function start() {
  try {
    await mongoose.connect(MONGO_URI, { dbName: MONGO_DB });
    logger.info('[alerts-service] Mongo connected');
    const port = Number(process.env.PORT || 5005);
    app.listen(port, () => {
      logger.info(`[alerts-service] listening on :${port}`);
      logger.info('[alerts-service] brands loaded:', Object.keys(getBrands()).join(', ') || '(none)');
    });
  } catch (err) {
    console.error('Failed to start alerts-service', err);
    process.exit(1);
  }
}

start();

module.exports = { app, mongoose, Alert, AlertChannel, BrandAlertChannel };
