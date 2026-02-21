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
const Session = require('./models/session');

app.post('/track', async (req, res) => {
  try {
    const sessionData = req.body;

    // Check for idempotency key to prevent duplicates
    if (!sessionData.idempotency_key) {
      return res.status(400).json({ error: 'idempotency_key is required' });
    }

    const existingSession = await Session.findOne({ idempotency_key: sessionData.idempotency_key });
    if (existingSession) {
      // Already processed this event, return success without saving again
      return res.status(200).json({ message: 'Event already processed', session: existingSession });
    }

    // Save new session document
    const session = new Session(sessionData);
    await session.save();

    res.status(201).json({ message: 'Session tracked successfully', session });
  } catch (err) {
    logger.error('Error tracking session:', err);
    res.status(500).json({ error: 'Failed to track alert' });
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
