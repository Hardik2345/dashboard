// scripts/producer-firehose.js
// MongoDB Change Streams → Kinesis Data Firehose (DirectPut) → S3 (GZIP NDJSON)

import { MongoClient } from 'mongodb';
import { FirehoseClient, PutRecordBatchCommand } from '@aws-sdk/client-firehose';

const {
  SRC_MONGO_URI,
  DB = 'mydb',
  FIREHOSE_STREAM,
  AWS_REGION = 'ap-south-1',
  BATCH_MAX = 500,
  BATCH_BYTES = 4_000_000,
  FLUSH_MS = 1000
} = process.env;

if (!SRC_MONGO_URI) throw new Error('Missing SRC_MONGO_URI');
if (!FIREHOSE_STREAM) throw new Error('Missing FIREHOSE_STREAM');

const fh = new FirehoseClient({ region: AWS_REGION });
const mongo = new MongoClient(SRC_MONGO_URI, { maxPoolSize: 8 });

function encode(record) {
  const buf = Buffer.from(JSON.stringify(record) + '\n', 'utf8');
  if (buf.length > 1_000_000) throw new Error('One record exceeds 1MB');
  return buf;
}

let batch = [];
let bytes = 0;

async function flush() {
  if (!batch.length) return;

  const res = await fh.send(new PutRecordBatchCommand({
    DeliveryStreamName: FIREHOSE_STREAM,
    Records: batch.map(Data => ({ Data }))
  }));

  if (res.FailedPutCount && res.FailedPutCount > 0) {
    const retry = [];
    res.RequestResponses.forEach((r, i) => { if (r.ErrorCode) retry.push(batch[i]); });
    if (retry.length) {
      await new Promise(r => setTimeout(r, 200 + Math.random() * 400));
      await fh.send(new PutRecordBatchCommand({
        DeliveryStreamName: FIREHOSE_STREAM,
        Records: retry.map(Data => ({ Data }))
      }));
    }
  }

  batch = [];
  bytes = 0;
}

setInterval(() => { flush().catch(console.error); }, Number(FLUSH_MS)).unref();

/**
 * Flatten key fields from Mongo's fullDocument to top-level so Athena columns populate.
 * We keep `doc` as a snapshot for deep dives, but queries can now read top-level columns.
 */
function envelopeFromChange(ch) {
  const doc = ch.fullDocument || {};
  const coll = ch.ns?.coll;

  const base = {
    v: 1,
    coll,                                // "sessions" | "events"
    op: ch.operationType,                // insert | update | replace
    brand_id: doc.brand_id || 'unknown', // Firehose uses this for partitioning
    session_id: doc.session_id ?? null,
    clusterTime: new Date().toISOString(),
    // keep full snapshot (optional, handy for ad-hoc JSON queries)
    doc
  };

  if (coll === 'events') {
    Object.assign(base, {
      event_id: doc.event_id ?? null,
      event_name: doc.event_name ?? null,
      occurred_at: doc.occurred_at ?? null,
      url: doc.url ?? null,
      referrer: doc.referrer ?? null,
      user_agent: doc.user_agent ?? null,
      client_id: doc.client_id ?? null,
      visitor_id: doc.visitor_id ?? null,
      raw: doc.raw ?? null
    });
  } else if (coll === 'sessions') {
    Object.assign(base, {
      actor_id: doc.actor_id ?? null,
      started_at: doc.started_at ?? null,
      last_event_at: doc.last_event_at ?? null,
      landing_url: doc.landing_url ?? null,
      landing_referrer: doc.landing_referrer ?? null,
      utm_source: doc.utm_source ?? null,
      utm_medium: doc.utm_medium ?? null,
      utm_campaign: doc.utm_campaign ?? null,
      utm_term: doc.utm_term ?? null,
      utm_content: doc.utm_content ?? null
    });
  }

  return base;
}

async function run() {
  await mongo.connect();
  const dbh = mongo.db(DB);

  const pipeline = [
    { $match: {
        operationType: { $in: ['insert','update','replace'] },
        'ns.coll': { $in: ['sessions','events'] }
    }},
    { $addFields: { coll: '$ns.coll' } }
  ];

  const stream = dbh.watch(pipeline, { fullDocument: 'updateLookup', batchSize: 500 });

  stream.on('change', async (ch) => {
    try {
      const env = envelopeFromChange(ch);
      const buf = encode(env);
      batch.push(buf);
      bytes += buf.length;

      if (batch.length >= Number(BATCH_MAX) || bytes >= Number(BATCH_BYTES)) {
        await flush();
      }
    } catch (e) {
      console.error('encode/queue error', e);
    }
  });

  stream.on('error', (e) => {
    console.error('change stream error', e);
    process.exit(1);
  });

  ['SIGINT','SIGTERM'].forEach(sig => {
    process.on(sig, async () => {
      try { await flush(); } finally { process.exit(0); }
    });
  });

  console.log('Streaming Mongo → Firehose → S3…');
}

run().catch((e) => { console.error(e); process.exit(1); });
