#!/usr/bin/env node
require('dotenv').config({
  path: require('path').resolve(__dirname, '../.env'),
});

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const OtpVerified = require('../models/otpVerified');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const MONGO_DB = process.env.MONGO_DB || 'alerts';
const CSV_PATH = path.resolve(
  __dirname,
  '../user-segmentation-SNOWPLOW-IN-193kbvc47o31-1773998983080.csv'
);

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = values[index] || '';
      return row;
    }, {});
  });
}

function parseTimestamp(value) {
  const match = String(value || '').trim().match(
    /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/
  );
  if (!match) return null;

  const [, day, month, year, hour, minute] = match;
  const isoValue = `${year}-${month}-${day}T${hour}:${minute}:00+05:30`;
  const parsed = new Date(isoValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function run() {
  const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parseCsv(csvContent);
  const uniqueRows = new Map();
  let skipped = 0;

  for (const row of rows) {
    const status = String(row['OTP Verified'] || '').trim().toLowerCase();
    const customerId = String(row['Phone Number'] || '').trim();
    const timestamp = parseTimestamp(row.Timestamp);

    if (status !== 'verified' || !customerId || !timestamp) {
      skipped += 1;
      continue;
    }

    const existing = uniqueRows.get(customerId);
    if (!existing || timestamp > existing.createdAt) {
      uniqueRows.set(customerId, {
        customer_id: customerId,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  }

  await mongoose.connect(MONGO_URI, { dbName: MONGO_DB });

  const customerIds = Array.from(uniqueRows.keys());
  const existingDocs = customerIds.length
    ? await OtpVerified.find(
        { customer_id: { $in: customerIds } },
        { customer_id: 1, _id: 0 }
      ).lean()
    : [];
  const existingIds = new Set(existingDocs.map((doc) => doc.customer_id));
  const docsToInsert = Array.from(uniqueRows.values()).filter(
    (doc) => !existingIds.has(doc.customer_id)
  );

  if (docsToInsert.length) {
    await OtpVerified.collection.insertMany(docsToInsert, { ordered: false });
  }

  console.log('[otp-import] completed');
  console.log(`csv rows: ${rows.length}`);
  console.log(`unique verified phones: ${uniqueRows.size}`);
  console.log(`skipped rows: ${skipped}`);
  console.log(`inserted: ${docsToInsert.length}`);
  console.log(`already present: ${existingIds.size}`);
}

run()
  .catch((err) => {
    console.error('[otp-import] failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
