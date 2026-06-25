const AUTH_ROLES = Object.freeze(["author", "viewer", "super_admin", "brand_user"]);
const ELEVATED_ROLES = new Set(["author", "admin", "super_admin"]);
const DEFAULT_PERMISSIONS = Object.freeze(["all"]);

function normalizeRole(role, fallback = "viewer") {
  return (role || fallback).toString().trim().toLowerCase();
}

function isElevatedRole(role) {
  return ELEVATED_ROLES.has(normalizeRole(role));
}

function normalizeBrandIds(brandIds = []) {
  if (!Array.isArray(brandIds)) return [];
  return [...new Set(brandIds.map((brandId) => (brandId || "").toString().trim().toUpperCase()).filter(Boolean))];
}

function normalizePrimaryBrand(primaryBrandId = null) {
  const normalized = (primaryBrandId || "").toString().trim().toUpperCase();
  return normalized || null;
}

function normalizePermissions(permissions = []) {
  const list = Array.isArray(permissions) ? permissions : [];
  const normalized = [...new Set(list.map((permission) => (permission || "").toString().trim()).filter(Boolean))];
  return normalized.length ? normalized : [...DEFAULT_PERMISSIONS];
}

async function fetchAllBrandIds() {
  const baseUrl = (process.env.TENANT_ROUTER_URL || "http://tenant-router:3004").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/tenant/brands`);

  if (!response.ok) {
    throw new Error(`failed to fetch brands (${response.status})`);
  }

  const payload = await response.json();
  const values = payload && typeof payload === "object" ? Object.values(payload) : [];
  const brandIds = normalizeBrandIds(values);

  if (!brandIds.length) {
    throw new Error("no brands available for super admin");
  }

  return brandIds.sort();
}

module.exports = {
  AUTH_ROLES,
  DEFAULT_PERMISSIONS,
  fetchAllBrandIds,
  isElevatedRole,
  normalizeBrandIds,
  normalizePermissions,
  normalizePrimaryBrand,
  normalizeRole,
};
