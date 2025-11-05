// scripts/producer-firehose.js
// MongoDB Change Streams → Kinesis Data Firehose (DirectPut) → S3 (GZIP NDJSON)

import { MongoClient } from 'mongodb';
import { FirehoseClient, PutRecordBatchCommand } from '@aws-sdk/client-firehose';

const {
  SRC_MONGO_URI,
  DB = 'mydb',
  FIREHOSE_STREAM,           // ← Terraform output (aws_kinesis_firehose_delivery_stream.to_s3.name)
  AWS_REGION = 'ap-south-1',
  BATCH_MAX = 500,           // Firehose max 500 records per PutRecordBatch
  BATCH_BYTES = 4_000_000,   // Firehose max 4 MB per PutRecordBatch
  FLUSH_MS = 1000            // flush every 1s
} = process.env;

if (!SRC_MONGO_URI) throw new Error('Missing SRC_MONGO_URI');
if (!FIREHOSE_STREAM) throw new Error('Missing FIREHOSE_STREAM');

const fh = new FirehoseClient({ region: AWS_REGION });
const mongo = new MongoClient(SRC_MONGO_URI, { maxPoolSize: 8 });

function encode(record) {
  // Firehose S3 wants bytes; we'll write NDJSON lines
  const buf = Buffer.from(JSON.stringify(record) + '\n', 'utf8');
  if (buf.length > 1_000_000) throw new Error('One record exceeds 1MB');
  return buf;
}

let batch = [];
let bytes = 0;

async function flush() {
  if (!batch.length) return;

  const payload = {
    DeliveryStreamName: FIREHOSE_STREAM,
    Records: batch.map(Data => ({ Data })) // Firehose API shape
  };

  const res = await fh.send(new PutRecordBatchCommand(payload));

  if (res.FailedPutCount && res.FailedPutCount > 0) {
    const retry = [];
    res.RequestResponses.forEach((r, i) => {
      if (r.ErrorCode) retry.push(batch[i]);
    });
    if (retry.length) {
      // Simple backoff+jitter
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

setInterval(() => { flush().catch(console.error); }, FLUSH_MS).unref();

function envelopeFromChange(ch) {
  const doc = ch.fullDocument || {};
  // Keep 'coll' and 'brand_id' at top level, Firehose extracts them for partitioning
  return {
    v: 1,
    coll: ch.ns?.coll,              // "sessions" | "events"
    op: ch.operationType,           // insert|update|replace
    brand_id: doc.brand_id || 'unknown',
    session_id: doc.session_id ?? null,
    clusterTime: new Date().toISOString(),
    doc                              // full document snapshot
  };
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

      if (batch.length >= BATCH_MAX || bytes >= BATCH_BYTES) {
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

  for (const sig of ['SIGINT','SIGTERM']) {
    process.on(sig, async () => {
      try { await flush(); } finally { process.exit(0); }
    });
  }

  console.log('Streaming Mongo → Firehose → S3…');
}

run().catch((e) => { console.error(e); process.exit(1); });
