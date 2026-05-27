const axios = require("axios");
const crypto = require("crypto");
const { env } = require("../../config/env");
const logger = require("../../utils/logger");

function signHeaders({ tenantId, userId = "reporting-service", role = "author" }) {
  const headers = {
    "x-brand-id": tenantId,
    "x-user-id": userId,
    "x-role": role,
  };
  if (env.GATEWAY_SHARED_SECRET) {
    const ts = String(Math.floor(Date.now() / 1000));
    const payload = `${userId}|${tenantId}|${role}|${ts}`;
    headers["x-gw-ts"] = ts;
    headers["x-gw-sig"] = crypto.createHmac("sha256", env.GATEWAY_SHARED_SECRET).update(payload).digest("hex");
  }
  return headers;
}

function getNestedValue(source, candidates) {
  for (const candidate of candidates) {
    const parts = candidate.split(".");
    let current = source;
    for (const part of parts) {
      current = current && current[part] !== undefined ? current[part] : undefined;
    }
    if (current && typeof current === "object" && current.value !== undefined) {
      current = current.value;
    }
    if (current !== undefined && current !== null && current !== "") return Number(current);
  }
  return 0;
}

function mapSummaryValue(payload, key) {
  const data = payload?.data || payload || {};
  const candidates = {
    total_orders: ["metrics.total_orders.value", "total_orders", "orders", "summary.total_orders", "metrics.total_orders"],
    gross_revenue: [
      "metrics.total_sales.value",
      "gross_revenue",
      "total_sales",
      "revenue",
      "summary.gross_revenue",
      "summary.total_sales",
    ],
    average_order_value: [
      "metrics.average_order_value.value",
      "average_order_value",
      "aov",
      "summary.average_order_value",
      "summary.aov",
    ],
    total_sessions: [
      "metrics.total_sessions.value",
      "total_sessions",
      "sessions",
      "summary.total_sessions",
      "summary.sessions",
    ],
    atc_rate: [
      "metrics.atc_rate.value",
      "atc_rate",
      "add_to_cart_rate",
      "summary.atc_rate",
      "summary.add_to_cart_rate",
    ],
    conversion_rate: [
      "metrics.conversion_rate.value",
      "conversion_rate",
      "summary.conversion_rate",
    ],
  };
  return getNestedValue(data, candidates[key] || [key]);
}

async function fetchSummary({ tenantId, user, startAt, endAt }) {
  try {
    const res = await axios.get(`${env.ANALYTICS_SERVICE_URL}/metrics/summary`, {
      timeout: 8000,
      headers: signHeaders({ tenantId, userId: user?.id || "reporting-service", role: user?.role || "author" }),
      params: {
        start: startAt.toISOString().slice(0, 10),
        end: endAt.toISOString().slice(0, 10),
      },
    });
    return res.data;
  } catch (err) {
    logger.warn("[reporting-service] analytics summary fetch failed; using zero fallback", {
      tenantId,
      error: err.message,
    });
    return {};
  }
}

module.exports = { fetchSummary, mapSummaryValue };
