function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

function requireAuthor(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated() && req.user?.isAuthor) return next();
  return res.status(403).json({ error: 'Forbidden' });
}

module.exports = {
  requireAuth,
  requireAuthor,
};
