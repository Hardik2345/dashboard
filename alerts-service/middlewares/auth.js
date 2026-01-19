function requireAuthor(req, res, next) {
  const role = (req.headers['x-role'] || req.headers['x-user-role'] || '').toString().toLowerCase();
  if (role !== 'author') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return next();
}

module.exports = { requireAuthor };
