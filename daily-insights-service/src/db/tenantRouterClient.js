// Trimmed port of analytics/shared/db/tenantRouterClient.js — same tenant-router
// contract, response shape, and env vars, kept as a small local copy since this
// service does not share a package with the analytics service.

const axios = require("axios");
const crypto = require("crypto");
const { LRUCache } = require("lru-cache");

const LOCAL_MODE = (process.env.LOCAL_MODE || "").toLowerCase() === "true";
const DEFAULT_TIMEZONE = "Asia/Kolkata";

const CACHE_TTL_MS = Number(process.env.TENANT_ROUTER_CACHE_TTL_MS || 300_000);
const CACHE_MAX = Number(process.env.TENANT_ROUTER_CACHE_SIZE || 200);
const cache = new LRUCache({ max: CACHE_MAX, ttl: CACHE_TTL_MS, updateAgeOnGet: true });

function normalizeTimezone(timezone, fallback = DEFAULT_TIMEZONE) {
  const candidate = (timezone || "").toString().trim() || fallback;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date(0));
    return candidate;
  } catch {
    return fallback;
  }
}

function decryptPassword(enc) {
  if (!enc) return "";
  const key = process.env.PASSWORD_AES_KEY;
  if (!key) {
    console.error("[tenantRouterClient] PASSWORD_AES_KEY not set; cannot decrypt password");
    return "";
  }
  try {
    let buf = Buffer.from(key);
    if (buf.length < 32) {
      const padded = Buffer.alloc(32);
      buf.copy(padded);
      buf = padded;
    } else if (buf.length > 32) {
      buf = buf.slice(0, 32);
    }
    const parts = enc.split(":");
    if (parts.length !== 2) return "";
    const iv = Buffer.from(parts[0], "base64");
    const decipher = crypto.createDecipheriv("aes-256-cbc", buf, iv);
    let dec = decipher.update(parts[1], "base64", "utf8");
    dec += decipher.final("utf8");
    return dec;
  } catch (e) {
    console.error("[tenantRouterClient] password decrypt failed", e.message);
    return "";
  }
}

function resolveFromEnv(brandKey) {
  const prefix = brandKey.toUpperCase();
  const host = process.env[`${prefix}_DB_HOST`];
  const user = process.env[`${prefix}_DB_USER`];
  const pass = process.env[`${prefix}_DB_PASS`];
  const dbName = process.env[`${prefix}_DB_NAME`] || brandKey;
  const port = Number(process.env[`${prefix}_DB_PORT`] || 3306);
  const timezone = normalizeTimezone(process.env[`${prefix}_STORE_TIMEZONE`] || DEFAULT_TIMEZONE);

  if (host && user && pass) {
    return { brandId: brandKey, host, port, user, password: pass, dbName, timezone };
  }
  return null;
}

async function resolveFromTenantRouter(brandKey) {
  const key = brandKey.toUpperCase();
  const baseUrl = (process.env.TENANT_ROUTER_URL || "http://localhost:3004").replace(/\/+$/, "");
  const token = process.env.TENANT_ROUTER_TOKEN || "";

  try {
    const res = await axios.post(
      `${baseUrl}/tenant/resolve`,
      { brand_id: key },
      {
        timeout: Number(process.env.TENANT_ROUTER_TIMEOUT_MS || 5000),
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      },
    );
    const data = res.data || {};
    const password = decryptPassword(data.password);
    const route = {
      brandId: key,
      dbName: data.database || key,
      host: data.rds_proxy_endpoint,
      port: Number(data.port || 3306),
      user: data.user || "",
      password,
      timezone: normalizeTimezone(data.store_timezone),
    };
    if (!route.host || !route.user || !route.password) {
      console.error("[tenantRouterClient] incomplete route from tenant router", key);
      return { error: "routing_unavailable" };
    }
    return route;
  } catch (err) {
    const status = err?.response?.status;
    if (status === 404) return { error: "not_found" };
    if (status === 403) return { error: "suspended" };
    console.error("[tenantRouterClient] resolve failed", key, err.message, status);
    return { error: "routing_unavailable" };
  }
}

async function resolveTenantRoute(brandKey) {
  const key = (brandKey || "").toString().trim().toUpperCase();
  if (!key) return { error: "missing_brand" };

  const cached = cache.get(key);
  if (cached) return cached;

  const route = LOCAL_MODE ? resolveFromEnv(key) : await resolveFromTenantRouter(key);

  if (!route) return { error: "not_found" };
  if (!route.error) cache.set(key, route);

  return route;
}

module.exports = { resolveTenantRoute };
