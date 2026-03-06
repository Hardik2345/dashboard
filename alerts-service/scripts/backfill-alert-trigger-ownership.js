#!/usr/bin/env node
require('dotenv').config();

const mongoose = require('mongoose');
const Alert = require('../models/alert');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const MONGO_DB = process.env.MONGO_DB || 'alerts';

async function run() {
  await mongoose.connect(MONGO_URI, { dbName: MONGO_DB });

  const missingDslFlagResult = await Alert.updateMany(
    { is_dsl_engine_alert: { $exists: false } },
    { $set: { is_dsl_engine_alert: false } }
  );

  const missingTriggerModeResult = await Alert.updateMany(
    { trigger_mode: { $exists: false } },
    { $set: { trigger_mode: 'alert_system' } }
  );

  console.log('[migration] alerts.trigger_ownership backfill complete');
  console.log(`is_dsl_engine_alert updated: ${missingDslFlagResult.modifiedCount}`);
  console.log(`trigger_mode updated: ${missingTriggerModeResult.modifiedCount}`);
}

run()
  .catch((err) => {
    console.error('[migration] failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
