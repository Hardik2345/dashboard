#!/usr/bin/env node
/**
 * Archive hourly_product_sessions rows older than retention window to S3 as Parquet.
 *
 * Usage:
 *   node scripts/archive-hourly-product-sessions.js
 *
 * Env (Brand source):
 *   API-only:
 *     GET_BRANDS_API, PIPELINE_AUTH_HEADER, PASSWORD_AES_KEY
 *     (brand DB creds are fetched from the API and db_password is decrypted)
 *
 * Env (S3):
 *   AWS_REGION, AWS_ACCESS_KEY_ID (or AWS_ACCESS_KEY), AWS_SECRET_ACCESS_KEY (or AWS_SECRET)
 *   AWS_S3_BUCKET
 *   HOURLY_PRODUCT_SESSIONS_S3_PREFIX   — default: hourly-product-sessions
 *   HOURLY_PRODUCT_SESSIONS_RETENTION_DAYS — default: 7
 */

import "dotenv/config";
import duckdbQueryService from "../services/duckdbQueryService.js";
import { loadBrandsForScripts } from "./utils/brandLoader.js";

const { writeParquetToS3, getRetentionDays, getS3Prefix } = duckdbQueryService;

function fmtDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function archiveBrand(brand) {
  const retentionDays = getRetentionDays();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffStr = fmtDate(cutoff);

  const conn = await brand.pool.getConnection();
  try {
    // Find distinct dates that need archiving
    const [dates] = await conn.query(
      `SELECT DISTINCT date FROM hourly_product_sessions WHERE date < ? ORDER BY date`,
      [cutoffStr]
    );

    if (!dates.length) {
      console.log(`[ARCHIVE][${brand.tag}] No expired dates to archive.`);
      return [];
    }

    console.log(`[ARCHIVE][${brand.tag}] Found ${dates.length} date(s) to archive (cutoff=${cutoffStr}).`);
    const archivedDates = [];

    for (const { date } of dates) {
      const dateStr = typeof date === "string" ? date : fmtDate(new Date(date));
      const [rows] = await conn.query(
        `SELECT
           date, hour, landing_page_type, landing_page_path,
           product_id, product_title,
           utm_source, utm_medium, utm_campaign, utm_content, utm_term,
           referrer_name, sessions, sessions_with_cart_additions
         FROM hourly_product_sessions
         WHERE date = ?`,
        [dateStr]
      );

      if (!rows.length) {
        console.log(`[ARCHIVE][${brand.tag}] No rows for ${dateStr}, skipping.`);
        continue;
      }

      // Format date strings for DuckDB
      const formattedRows = rows.map((r) => ({
        ...r,
        date: typeof r.date === "string" ? r.date : fmtDate(new Date(r.date)),
      }));

      const [year, month, day] = dateStr.split("-");
      const bucket = process.env.AWS_S3_BUCKET;
      const prefix = getS3Prefix();
      const s3Path = `s3://${bucket}/${prefix}/${brand.tag}/year=${year}/month=${month}/day=${day}/data.parquet`;

      console.log(`[ARCHIVE][${brand.tag}] Writing ${formattedRows.length} rows for ${dateStr} → ${s3Path}`);
      await writeParquetToS3(formattedRows, s3Path);
      archivedDates.push(dateStr);
      console.log(`[ARCHIVE][${brand.tag}] Archived ${dateStr} successfully.`);
    }

    return archivedDates;
  } finally {
    conn.release();
  }
}

async function main() {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) {
    console.error("[ARCHIVE] AWS_S3_BUCKET is required.");
    process.exit(1);
  }

  const brands = await loadBrandsForScripts();
  if (!brands.length) {
    console.error("[ARCHIVE] No brands configured.");
    process.exit(1);
  }

  console.log(`[ARCHIVE] Starting archive for ${brands.length} brand(s)...`);

  for (const brand of brands) {
    try {
      const archivedDates = await archiveBrand(brand);
      console.log(`[ARCHIVE][${brand.tag}] Done. Archived ${archivedDates.length} date(s).`);
    } catch (err) {
      console.error(`[ARCHIVE][${brand.tag}] Failed:`, err);
    } finally {
      await brand.pool.end();
    }
  }

  console.log("[ARCHIVE] All done.");
  process.exit(0);
}

main();
