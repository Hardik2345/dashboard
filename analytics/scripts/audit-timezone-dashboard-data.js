#!/usr/bin/env node

/* eslint-disable no-console */

const { QueryTypes } = require("sequelize");
const { resolveTenantRoute } = require("../shared/db/tenantRouterClient");
const { getTenantConnection, closeAllTenantConnections } = require("../shared/db/tenantConnection");
const {
  DEFAULT_TIMEZONE,
  getTimezoneContext,
  normalizeTimezone,
} = require("../shared/utils/date");

const HOURLY_TABLES = [
  { table: "hour_wise_sales", dateColumn: "date", hourColumn: "hour" },
  { table: "hourly_sessions_summary_shopify", dateColumn: "date", hourColumn: "hour" },
  { table: "hourly_product_sessions", dateColumn: "date", hourColumn: "hour" },
];

const DAILY_TABLES = [
  { table: "overall_summary", dateColumn: "date" },
  { table: "bundle_daily_rollup", dateColumn: "date" },
  { table: "bundle_product_daily_rollup", dateColumn: "date" },
];

function parseBrands(argv) {
  const explicit = argv
    .flatMap((arg) => arg.split(","))
    .map((arg) => arg.trim().toUpperCase())
    .filter(Boolean);
  if (explicit.length) return [...new Set(explicit)];
  const envBrands = (process.env.AUDIT_BRANDS || process.env.BRAND_LIST || "")
    .split(",")
    .map((arg) => arg.trim().toUpperCase())
    .filter(Boolean);
  return [...new Set(envBrands)];
}

async function tableExists(conn, table) {
  try {
    const rows = await conn.query("SHOW TABLES LIKE ?", {
      type: QueryTypes.SELECT,
      replacements: [table],
    });
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function queryHourlyTable(conn, table, dateColumn, hourColumn, today, currentHour) {
  const exists = await tableExists(conn, table);
  if (!exists) return { table, status: "missing" };
  const rows = await conn.query(
    `
      SELECT
        MAX(${dateColumn}) AS max_date,
        MAX(CASE WHEN ${dateColumn} = ? THEN ${hourColumn} ELSE NULL END) AS max_today_hour,
        SUM(CASE WHEN ${dateColumn} = ? AND ${hourColumn} > ? THEN 1 ELSE 0 END) AS future_today_rows
      FROM ${table}
    `,
    {
      type: QueryTypes.SELECT,
      replacements: [today, today, currentHour],
    },
  );
  const row = rows[0] || {};
  return {
    table,
    status: Number(row.future_today_rows || 0) > 0 ? "fail" : "ok",
    max_date: row.max_date || null,
    max_today_hour: row.max_today_hour == null ? null : Number(row.max_today_hour),
    future_today_rows: Number(row.future_today_rows || 0),
  };
}

async function queryDailyTable(conn, table, dateColumn, today) {
  const exists = await tableExists(conn, table);
  if (!exists) return { table, status: "missing" };
  const rows = await conn.query(
    `
      SELECT
        MAX(${dateColumn}) AS max_date,
        SUM(CASE WHEN ${dateColumn} > ? THEN 1 ELSE 0 END) AS future_date_rows
      FROM ${table}
    `,
    {
      type: QueryTypes.SELECT,
      replacements: [today],
    },
  );
  const row = rows[0] || {};
  return {
    table,
    status: Number(row.future_date_rows || 0) > 0 ? "fail" : "ok",
    max_date: row.max_date || null,
    future_date_rows: Number(row.future_date_rows || 0),
  };
}

async function auditBrand(brandKey) {
  const route = await resolveTenantRoute(brandKey);
  if (!route || route.error) {
    return { brand: brandKey, status: "routing_failed", error: route?.error || "routing_unavailable" };
  }
  const timezone = normalizeTimezone(route.timezone || DEFAULT_TIMEZONE);
  const ctx = getTimezoneContext(new Date(), timezone);
  const tenant = getTenantConnection(route);
  const conn = tenant.sequelize;
  const hourly = [];
  const daily = [];

  for (const table of HOURLY_TABLES) {
    hourly.push(await queryHourlyTable(
      conn,
      table.table,
      table.dateColumn,
      table.hourColumn,
      ctx.today,
      ctx.currentHour,
    ));
  }
  for (const table of DAILY_TABLES) {
    daily.push(await queryDailyTable(conn, table.table, table.dateColumn, ctx.today));
  }

  const failed = [...hourly, ...daily].some((entry) => entry.status === "fail");
  return {
    brand: brandKey,
    status: failed ? "fail" : "ok",
    timezone,
    today: ctx.today,
    current_hour: ctx.currentHour,
    hourly,
    daily,
  };
}

async function main() {
  const brands = parseBrands(process.argv.slice(2));
  if (!brands.length) {
    console.error("Usage: node analytics/scripts/audit-timezone-dashboard-data.js BRAND[,BRAND...]");
    process.exitCode = 2;
    return;
  }

  const results = [];
  for (const brand of brands) {
    results.push(await auditBrand(brand));
  }
  console.log(JSON.stringify({ checked_at: new Date().toISOString(), results }, null, 2));
  if (results.some((result) => result.status === "fail" || result.status === "routing_failed")) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeAllTenantConnections();
  });
