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
const Alert = require('./models/alert');
const AlertChannel = require('./models/alertChannel');
const BrandAlertChannel = require('./models/brandAlertChannel');

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

    console.log(req.body);

    if (!req.headers['x-push-token'] || req.headers['x-push-token'] !== process.env.PUSH_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized', message: "push token is required" });
    }

    const payload = { ...req.body };
    // Exclude the email body before saving
    delete payload.email_body;

    // Store the document in the 'pushnotifications' collection
    await mongoose.connection.collection('pushnotifications').insertOne({
      ...payload,
      stored_at: new Date()
    });

    res.json({
      message: 'Push notification received and stored successfully',
      data: payload
    });

  } catch (err) {
    logger.error('Error logging push notification:', err);
    res.status(500).json({ error: 'Failed to log push notification' });
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
