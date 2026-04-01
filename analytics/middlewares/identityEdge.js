const crypto = require("crypto");
const logger = require("../utils/logger");

const GW_SECRET = process.env.GATEWAY_SHARED_SECRET || "";
const MAX_SKEW_MS = 5 * 60 * 1000;

function verifyGatewaySignature(req) {
  if (!GW_SECRET) return true;

  const ts = (req.headers["x-gw-ts"] || "").toString().trim();
  const sig = (req.headers["x-gw-sig"] || "").toString().trim();
  const userId = (req.headers["x-user-id"] || "").toString().trim();
  const brandId = (req.headers["x-brand-id"] || req.headers["x-brand-key"] || "")
    .toString()
    .trim();
  const role = (req.headers["x-role"] || "").toString().trim().toLowerCase();

  if (!ts || !sig || !userId || !brandId || !role) {
    logger.warn("[identity-edge] missing gateway header(s)", {
      hasTs: !!ts,
      hasSig: !!sig,
      hasUserId: !!userId,
      hasBrandId: !!brandId,
      hasRole: !!role,
    });
    return false;
  }

  const now = Date.now();
  const tsMs = Number(ts) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(now - tsMs) > MAX_SKEW_MS) {
    logger.warn("[identity-edge] timestamp invalid or skewed", { ts, now });
    return false;
  }

  const payload = `${userId}|${brandId}|${role}|${ts}`;
  const expectedHex = crypto
    .createHmac("sha256", GW_SECRET)
    .update(payload)
    .digest("hex");
  const expectedB64 = crypto
    .createHmac("sha256", GW_SECRET)
    .update(payload)
    .digest("base64");

  const tryEqual = (left, right) => {
    const leftBuf = Buffer.from(left);
    const rightBuf = Buffer.from(right);
    if (leftBuf.length !== rightBuf.length) return false;
    return crypto.timingSafeEqual(leftBuf, rightBuf);
  };

  if (tryEqual(expectedHex, sig) || tryEqual(expectedB64, sig)) {
    return true;
  }

  logger.warn("[identity-edge] signature mismatch", {
    signatureLength: sig.length,
    expectedHexLength: expectedHex.length,
    expectedB64Length: expectedB64.length,
  });
  return false;
}

function buildPrincipalFromHeaders(req) {
  const userId = (req.headers["x-user-id"] || "").toString().trim();
  const brandId = (req.headers["x-brand-id"] || req.headers["x-brand-key"] || "")
    .toString()
    .trim();
  const roleRaw = (req.headers["x-role"] || "").toString().trim().toLowerCase();
  const email = (req.headers["x-email"] || "").toString().trim().toLowerCase();

  if (!userId || !brandId || !roleRaw) return null;

  return {
    id: userId,
    brandKey: brandId.toUpperCase(),
    role: roleRaw,
    isAuthor: roleRaw === "author" || roleRaw === "admin",
    email: email || null,
  };
}

function requireTrustedPrincipal(req, res, next) {
  if (!verifyGatewaySignature(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const principal = buildPrincipalFromHeaders(req);
  if (!principal) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.user = principal;
  req.isAuthenticated = () => true;
  return next();
}

function requireTrustedAuthor(req, res, next) {
  if (!verifyGatewaySignature(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const principal = buildPrincipalFromHeaders(req);
  if (!principal) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.user = principal;
  req.isAuthenticated = () => true;

  if (principal.isAuthor) return next();
  return res.status(403).json({ error: "Forbidden" });
}

module.exports = {
  verifyGatewaySignature,
  buildPrincipalFromHeaders,
  requireTrustedPrincipal,
  requireTrustedAuthor,
};
