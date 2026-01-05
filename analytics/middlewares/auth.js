const crypto = require('crypto');

const GW_SECRET = process.env.GATEWAY_SHARED_SECRET || '';
const MAX_SKEW_MS = 5 * 60 * 1000; // 5 minutes

function verifyGatewaySignature(req) {
  if (!GW_SECRET) return true; // no secret configured, skip
  const ts = (req.headers['x-gw-ts'] || '').toString().trim();
  const sig = (req.headers['x-gw-sig'] || '').toString().trim();
  const userId = (req.headers['x-user-id'] || '').toString().trim();
  const brandId = (req.headers['x-brand-id'] || req.headers['x-brand-key'] || '').toString().trim();
  const role = (req.headers['x-role'] || '').toString().trim().toLowerCase();
  if (!ts || !sig || !userId || !brandId || !role) {
    console.warn('[gw-sig] missing header(s)', { ts: !!ts, sig: !!sig, userId: !!userId, brandId: !!brandId, role: !!role });
    return false;
  }
  const now = Date.now();
  const tsMs = Number(ts) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(now - tsMs) > MAX_SKEW_MS) {
    console.warn('[gw-sig] timestamp invalid or skewed', { ts, now });
    return false;
  }
  const payload = `${userId}|${brandId}|${role}|${ts}`;
  const expectedHex = crypto.createHmac('sha256', GW_SECRET).update(payload).digest('hex');
  const expectedB64 = crypto.createHmac('sha256', GW_SECRET).update(payload).digest('base64');

  const tryEqual = (a, b) => {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
  };

  if (tryEqual(expectedHex, sig)) return true;
  if (tryEqual(expectedB64, sig)) return true;

  console.warn('[gw-sig] signature mismatch', { sigLen: sig.length, expHexLen: expectedHex.length, expB64Len: expectedB64.length });
  return false;
}

function buildUserFromHeaders(req) {
  const userId = (req.headers['x-user-id'] || '').toString().trim();
  const brandId = (req.headers['x-brand-id'] || req.headers['x-brand-key'] || '').toString().trim();
  const roleRaw = (req.headers['x-role'] || '').toString().trim().toLowerCase();
  const email = (req.headers['x-email'] || '').toString().trim().toLowerCase();
  const isAuthor = roleRaw === 'author' || roleRaw === 'admin';

  if (!userId || !brandId || !roleRaw) return null;

  return {
    id: userId,
    brandKey: brandId.toUpperCase(),
    role: roleRaw,
    isAuthor,
    email: email || null,
  };
}

function requireAuth(req, res, next) {
  if (!verifyGatewaySignature(req)) return res.status(401).json({ error: 'Unauthorized' });
  const user = buildUserFromHeaders(req);
  console.log("Auth middleware user:", user);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  // Preserve compatibility with any downstream checks
  req.isAuthenticated = () => true;
  return next();
}

function requireAuthor(req, res, next) {
  if (!verifyGatewaySignature(req)) return res.status(401).json({ error: 'Unauthorized' });
  const user = buildUserFromHeaders(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  req.isAuthenticated = () => true;
  if (user.isAuthor) return next();
  return res.status(403).json({ error: 'Forbidden' });
}

module.exports = {
  requireAuth,
  requireAuthor,
};
