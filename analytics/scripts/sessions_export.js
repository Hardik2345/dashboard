/* eslint-disable no-console */
// Batch export sessions to CSV and (optionally) upload to S3.
// Usage:
//   node scripts/sessions_export.js --date=2025-02-10 --brand=tmc_shop
// Env (required):
//   MONGO_URI, MONGO_DB, MONGO_COLLECTION
//   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (if uploading to S3_BUCKET)
//   S3_BUCKET (optional to trigger upload), S3_PREFIX (optional, default: sessions/)
//   TZ_OFFSET_MINUTES (optional, default: 330 for IST)
//   OUTPUT_DIR (optional, default: /tmp)
//
// Default date is yesterday in TZ_OFFSET_MINUTES.

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { Parser } = require('json2csv');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const [k, v] = arg.split('=');
    if (k && v) args[k.replace(/^--/, '')] = v;
  }
  return args;
}

function getOffsetMinutes() {
  const raw = process.env.TZ_OFFSET_MINUTES;
  const n = Number(raw);
  if (Number.isFinite(n)) return n;
  return 330; // IST default
}

function parseDateInput(input) {
  if (!input) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!match) return null;
  const [, y, m, d] = match;
  return { year: Number(y), month: Number(m), day: Number(d) };
}

function computeDayRangeUtc(dateParts, offsetMinutes) {
  const startUtcMs = Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day) - offsetMinutes * 60 * 1000;
  const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000;
  return { start: new Date(startUtcMs), end: new Date(endUtcMs) };
}

function yesterdayAtOffset(offsetMinutes) {
  const now = Date.now();
  const localNow = new Date(now + offsetMinutes * 60 * 1000);
  const prev = new Date(localNow.getTime() - 24 * 60 * 60 * 1000);
  return { year: prev.getUTCFullYear(), month: prev.getUTCMonth() + 1, day: prev.getUTCDate() };
}

function buildFilename(dateParts, brandId) {
  const y = dateParts.year.toString().padStart(4, '0');
  const m = dateParts.month.toString().padStart(2, '0');
  const d = dateParts.day.toString().padStart(2, '0');
  const brandPart = brandId ? `${brandId}_` : '';
  return `${brandPart}sessions_${y}-${m}-${d}.csv`;
}

async function uploadToS3({ bucket, key, body, region }) {
  const client = new S3Client({ region });
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: 'text/csv',
  }));
}

async function exportSessions() {
  const args = parseArgs();
  const offsetMinutes = getOffsetMinutes();
  const dateInput = parseDateInput(args.date || process.env.EXPORT_DATE) || yesterdayAtOffset(offsetMinutes);
  const brandId = args.brand || process.env.SESSIONS_BRAND_ID || '';
  const mongoUri = process.env.MONGO_URI;
  const mongoDb = process.env.MONGO_DB || 'test';
  const mongoCollection = process.env.MONGO_COLLECTION || 'sessions';
  const outputDir = process.env.OUTPUT_DIR || '/tmp';
  const bucket = process.env.S3_BUCKET || '';
  const s3Prefix = (process.env.S3_PREFIX || 'sessions/').replace(/^\/*/, '').replace(/\/+$/, '');
  const region = process.env.AWS_REGION;

  if (!mongoUri) {
    console.error('MONGO_URI is required');
    process.exit(1);
  }
  if (bucket && !region) {
    console.error('AWS_REGION is required when S3_BUCKET is set');
    process.exit(1);
  }

  const { start, end } = computeDayRangeUtc(dateInput, offsetMinutes);
  const filename = buildFilename(dateInput, brandId);
  const outputPath = path.join(outputDir, filename);

  const client = new MongoClient(mongoUri);
  try {
    console.log(`Connecting to MongoDB...`);
    await client.connect();
    const db = client.db(mongoDb);
    const collection = db.collection(mongoCollection);

    const query = {
      started_at: { $gte: start, $lt: end },
    };
    if (brandId) query.brand_id = brandId;

    console.log(`Querying sessions ${brandId ? `for brand ${brandId} ` : ''}from ${start.toISOString()} to ${end.toISOString()}`);
    const sessions = await collection.find(query).toArray();
    if (!sessions.length) {
      console.log('No sessions found for the requested window.');
      return;
    }

    const cleaned = sessions.map((s) => ({
      ...s,
      _id: s._id?.toString?.() || s._id,
    }));
    const csv = new Parser().parse(cleaned);
    fs.writeFileSync(outputPath, csv);
    console.log(`CSV written to ${outputPath} (${sessions.length} rows)`);

    if (bucket) {
      const y = dateInput.year.toString().padStart(4, '0');
      const m = dateInput.month.toString().padStart(2, '0');
      const d = dateInput.day.toString().padStart(2, '0');
      const keyParts = [s3Prefix, y, m, d, filename].filter(Boolean);
      const s3Key = keyParts.join('/');
      console.log(`Uploading to s3://${bucket}/${s3Key} ...`);
      await uploadToS3({ bucket, key: s3Key, body: csv, region });
      console.log('Upload complete.');
    } else {
      console.log('S3_BUCKET not set; skipping upload.');
    }
  } catch (err) {
    console.error('Export failed:', err);
    process.exitCode = 1;
  } finally {
    await client.close().catch(() => {});
  }
}

exportSessions();
