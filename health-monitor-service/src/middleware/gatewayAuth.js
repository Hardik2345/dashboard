const crypto = require("crypto");

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function verifyGatewaySignature(req, config) {
  // Fail-closed: without a shared secret we cannot prove the request came from
  // the gateway, so reject — unless insecure auth is explicitly opted into
  // (local dev / tests only).
  if (!config.gatewaySharedSecret) return config.allowInsecureAuth === true;
  const userId = req.headers["x-user-id"] || "";
  const brand = req.headers["x-brand-id"] || "";
  const role = req.headers["x-role"] || req.headers["x-user-role"] || "";
  const ts = req.headers["x-gw-ts"] || "";
  const sig = req.headers["x-gw-sig"] || "";
  if (!userId || !brand || !role || !ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const payload = [userId, brand, role, ts].join("|");
  const expected = crypto
    .createHmac("sha256", config.gatewaySharedSecret)
    .update(payload)
    .digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(String(sig));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function principalFromGatewayHeaders(req) {
  const role = String(req.headers["x-role"] || req.headers["x-user-role"] || "viewer").toLowerCase();
  return {
    user_id: String(req.headers["x-user-id"] || ""),
    role,
    isAuthor: ["author", "admin", "super_admin"].includes(role),
    permissions: parseList(req.headers["x-permissions"]),
  };
}

function buildAuthMiddleware(config) {
  return function authMiddleware(req, res, next) {
    if (!verifyGatewaySignature(req, config)) {
      return res.status(401).json({ error: "invalid_gateway_signature" });
    }
    const principal = principalFromGatewayHeaders(req);
    if (!principal.user_id) {
      return res.status(401).json({ error: "missing_identity" });
    }
    req.principal = principal;
    return next();
  };
}

function requirePermission(permission) {
  return function permissionMiddleware(req, res, next) {
    const principal = req.principal;
    if (!principal) return res.status(401).json({ error: "missing_identity" });
    if (
      principal.isAuthor ||
      principal.permissions.includes("all") ||
      principal.permissions.includes(permission)
    ) {
      return next();
    }
    return res.status(403).json({ error: "forbidden" });
  };
}

module.exports = {
  buildAuthMiddleware,
  verifyGatewaySignature,
  principalFromGatewayHeaders,
  requirePermission,
};
