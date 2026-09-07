const crypto = require("crypto");
const jwt = require("jsonwebtoken");

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function loadPublicKeys(env = process.env) {
  const raw = env.AUTH_KEYS || "";
  if (!raw) return new Map();
  const parsed = JSON.parse(raw);
  const keys = new Map();
  for (const key of parsed) {
    if (key.kid && key.publicKey) keys.set(key.kid, key.publicKey);
  }
  return keys;
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

function principalFromClaims(claims = {}) {
  const role = String(claims.role || "viewer").toLowerCase();
  return {
    user_id: String(claims.sub || ""),
    email: claims.email || "",
    name: claims.name || "",
    role,
    isAuthor: role === "author",
    brand_key: String(claims.primary_brand_id || "").toUpperCase(),
    brand_ids: (claims.brand_ids || []).map((brand) => String(brand).toUpperCase()),
    memberships: claims.memberships || [],
    permissions: [],
  };
}

function verifyJwt(token, config) {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded?.header?.kid) throw new Error("invalid_token");
  const keys = loadPublicKeys({ AUTH_KEYS: config.authKeys });
  const publicKey = keys.get(decoded.header.kid);
  if (!publicKey) throw new Error("unknown_kid");
  return principalFromClaims(jwt.verify(token, publicKey, { algorithms: ["RS256"] }));
}

function principalFromGatewayHeaders(req) {
  const role = String(req.headers["x-role"] || req.headers["x-user-role"] || "viewer").toLowerCase();
  const brandKey = String(req.headers["x-brand-id"] || "").toUpperCase();
  return {
    user_id: String(req.headers["x-user-id"] || ""),
    email: String(req.headers["x-email"] || ""),
    name: String(req.headers["x-name"] || ""),
    role,
    isAuthor: role === "author",
    brand_key: brandKey,
    brand_ids: brandKey ? [brandKey] : [],
    memberships: brandKey ? [{ brand_id: brandKey, permissions: parseList(req.headers["x-permissions"]) }] : [],
    permissions: parseList(req.headers["x-permissions"]),
  };
}

function buildAuthMiddleware(config) {
  return function authMiddleware(req, res, next) {
    if (!verifyGatewaySignature(req, config)) {
      return res.status(401).json({ error: "invalid_gateway_signature" });
    }
    const principal = principalFromGatewayHeaders(req);
    if (!principal.user_id || !principal.brand_key) {
      return res.status(401).json({ error: "missing_identity" });
    }
    req.principal = principal;
    return next();
  };
}

module.exports = {
  buildAuthMiddleware,
  principalFromClaims,
  principalFromGatewayHeaders,
  verifyJwt,
};
