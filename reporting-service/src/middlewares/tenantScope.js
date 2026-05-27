function tenantScope(req, res, next) {
  const tenantId = String(req.user?.brandKey || req.headers["x-brand-id"] || req.headers["x-brand-key"] || "")
    .trim()
    .toUpperCase();
  if (!tenantId) return res.status(400).json({ error: "tenant_id_required" });
  req.tenantId = tenantId;
  return next();
}

module.exports = { tenantScope };
