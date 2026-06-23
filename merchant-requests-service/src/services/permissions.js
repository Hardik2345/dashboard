function normalizeBrandKey(value) {
  return String(value || "").trim().toUpperCase();
}

function getAllowedBrands(principal) {
  if (!principal) return [];
  if (principal.isAuthor) return principal.brand_ids || [];
  return Array.from(
    new Set(
      [
        principal.brand_key,
        ...(principal.brand_ids || []),
        ...(principal.memberships || []).map((membership) => membership.brand_id),
      ]
        .map(normalizeBrandKey)
        .filter(Boolean),
    ),
  );
}

function canAccessBrand(principal, brandKey) {
  if (!principal) return false;
  if (principal.isAuthor) return true;
  return getAllowedBrands(principal).includes(normalizeBrandKey(brandKey));
}

function assertBrandAccess(principal, brandKey) {
  if (canAccessBrand(principal, brandKey)) return;
  const err = new Error("brand_forbidden");
  err.statusCode = 403;
  throw err;
}

function hasPermission(principal, permission) {
  if (!principal) return false;
  if (principal.isAuthor) return true;
  const permissions = new Set([
    ...(principal.permissions || []),
    ...(principal.memberships || []).flatMap((membership) => membership.permissions || []),
  ]);
  return permissions.has("all") || permissions.has(permission);
}

function assertPermission(principal, permission) {
  if (hasPermission(principal, permission)) return;
  const err = new Error("permission_forbidden");
  err.statusCode = 403;
  throw err;
}

function assertAuthor(principal) {
  if (principal?.isAuthor) return;
  const err = new Error("author_required");
  err.statusCode = 403;
  throw err;
}

module.exports = {
  assertAuthor,
  assertBrandAccess,
  assertPermission,
  canAccessBrand,
  getAllowedBrands,
  hasPermission,
  normalizeBrandKey,
};
