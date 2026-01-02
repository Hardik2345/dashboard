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
  const user = buildUserFromHeaders(req);
  console.log("Auth middleware user:", user);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  // Preserve compatibility with any downstream checks
  req.isAuthenticated = () => true;
  return next();
}

function requireAuthor(req, res, next) {
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
