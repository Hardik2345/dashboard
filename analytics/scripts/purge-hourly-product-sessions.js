#!/usr/bin/env node
/**
 * Purge archived hourly_product_sessions rows from MySQL.
 * Only deletes rows for dates whose Parquet archive exists in S3.
 *
 * Usage:
 *   node scripts/purge-hourly-product-sessions.js
 *
 * Env (Brand source):
 *   Option A (recommended, same as product_sessions_pipeline.js):
 *     GET_BRANDS_API, PIPELINE_AUTH_HEADER, PASSWORD_AES_KEY
 *     (brand DB creds are fetched from the API and db_password is decrypted)
 *   Option B (fallback):
 *     TOTAL_CONFIG_COUNT, BRAND_TAG_i, DB_HOST_i, DB_USER_i, DB_PASSWORD_i, DB_DATABASE_i
 *
 * Env (S3):
 *   AWS_REGION, AWS_ACCESS_KEY_ID (or AWS_ACCESS_KEY), AWS_SECRET_ACCESS_KEY (or AWS_SECRET)
 *   AWS_S3_BUCKET
 *   HOURLY_PRODUCT_SESSIONS_S3_PREFIX   — default: hourly-product-sessions
 *   HOURLY_PRODUCT_SESSIONS_RETENTION_DAYS — default: 7
 */

import "dotenv/config";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { loadBrandsForScripts } from "./utils/brandLoader.js";

const S3_PREFIX = process.env.HOURLY_PRODUCT_SESSIONS_S3_PREFIX || "hourly-product-sessions";
const RETENTION_DAYS = parseInt(process.env.HOURLY_PRODUCT_SESSIONS_RETENTION_DAYS || "7", 10);

function fmtDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function s3ArchiveExists(s3Client, bucket, brandTag, dateStr) {
  const [year, month, day] = dateStr.split("-");
  const key = `${S3_PREFIX}/${brandTag}/year=${year}/month=${month}/day=${day}/data.parquet`;

  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
}

async function purgeBrand(brand, s3Client, bucket) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffStr = fmtDate(cutoff);

  const conn = await brand.pool.getConnection();
  try {
    const [dates] = await conn.query(
      `SELECT DISTINCT date FROM hourly_product_sessions WHERE date < ? ORDER BY date`,
      [cutoffStr]
    );

    if (!dates.length) {
      console.log(`[PURGE][${brand.tag}] No expired dates to purge.`);
      return;
    }

    console.log(`[PURGE][${brand.tag}] Found ${dates.length} expired date(s) (cutoff=${cutoffStr}).`);

    for (const { date } of dates) {
      const dateStr = typeof date === "string" ? date : fmtDate(new Date(date));

      // Safety check: only purge if archive exists in S3
      const exists = await s3ArchiveExists(s3Client, bucket, brand.tag, dateStr);
      if (!exists) {
        console.warn(`[PURGE][${brand.tag}] SKIPPING ${dateStr} — S3 archive not found. Archive first!`);
        continue;
      }

      const [result] = await conn.query(
        `DELETE FROM hourly_product_sessions WHERE date = ?`,
        [dateStr]
      );

      console.log(`[PURGE][${brand.tag}] Purged ${dateStr}: ${result.affectedRows} rows deleted.`);
    }
  } finally {
    conn.release();
  }
}

async function main() {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) {
    console.error("[PURGE] AWS_S3_BUCKET is required.");
    process.exit(1);
  }

  const region = process.env.AWS_REGION || "ap-south-1";
  const s3Client = new S3Client({ region });

  const brands = await loadBrandsForScripts();
  if (!brands.length) {
    console.error("[PURGE] No brands configured.");
    process.exit(1);
  }

  console.log(`[PURGE] Starting purge for ${brands.length} brand(s)...`);

  for (const brand of brands) {
    try {
      await purgeBrand(brand, s3Client, bucket);
      console.log(`[PURGE][${brand.tag}] Done.`);
    } catch (err) {
      console.error(`[PURGE][${brand.tag}] Failed:`, err);
    } finally {
      await brand.pool.end();
    }
  }

  console.log("[PURGE] All done.");
  process.exit(0);
}

main();
