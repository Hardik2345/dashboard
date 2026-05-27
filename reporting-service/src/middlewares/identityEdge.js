const crypto = require("crypto");
const { env } = require("../config/env");
const logger = require("../utils/logger");

const MAX_SKEW_MS = 5 * 60 * 1000;

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyGatewaySignature(req) {
  if (!env.GATEWAY_SHARED_SECRET) return true;

  const ts = String(req.headers["x-gw-ts"] || "").trim();
  const sig = String(req.headers["x-gw-sig"] || "").trim();
  const userId = String(req.headers["x-user-id"] || "").trim();
  const brandId = String(req.headers["x-brand-id"] || req.headers["x-brand-key"] || "").trim();
  const role = String(req.headers["x-role"] || "").trim().toLowerCase();

  if (!ts || !sig || !userId || !brandId || !role) return false;
  const tsMs = Number(ts) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > MAX_SKEW_MS) return false;

  const payload = `${userId}|${brandId}|${role}|${ts}`;
  const expectedHex = crypto.createHmac("sha256", env.GATEWAY_SHARED_SECRET).update(payload).digest("hex");
  const expectedB64 = crypto.createHmac("sha256", env.GATEWAY_SHARED_SECRET).update(payload).digest("base64");
  return safeEqual(expectedHex, sig) || safeEqual(expectedB64, sig);
}

function buildPrincipalFromHeaders(req) {
  const id = String(req.headers["x-user-id"] || "").trim();
  const brandKey = String(req.headers["x-brand-id"] || req.headers["x-brand-key"] || "").trim().toUpperCase();
  const role = String(req.headers["x-role"] || "").trim().toLowerCase();
  const email = String(req.headers["x-email"] || "").trim().toLowerCase();
  const permissions = String(req.headers["x-permissions"] || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!id || !brandKey || !role) return null;
  return { id, brandKey, role, email: email || null, permissions, isAuthor: role === "author" || role === "admin" };
}

function requireTrustedAuthor(req, res, next) {
  if (!verifyGatewaySignature(req)) {
    logger.warn("[reporting-service] invalid gateway signature");
    return res.status(401).json({ error: "Unauthorized" });
  }
  const user = buildPrincipalFromHeaders(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  req.user = user;
  req.isAuthenticated = () => true;
  if (user.isAuthor) return next();
  return res.status(403).json({ error: "Forbidden" });
}

module.exports = { verifyGatewaySignature, buildPrincipalFromHeaders, requireTrustedAuthor };
