const express = require("express");
const router = express.Router();
const tenantRouterService = require("../services/tenantRouter.service");
const cdsService = require("../services/cds.service");

router.post("/resolve", async (req, res) => {
  const { brand_id } = req.body;

  if (!brand_id) {
    return res.status(400).json({ error: "missing_brand_id" });
  }

  const tenantMetadata = await tenantRouterService.resolveTenant(brand_id);

  if (tenantMetadata && tenantMetadata.rds_proxy_endpoint) {
    console.log(
      `[Tenant Router] Resolving brand ${brand_id} to DB Host: ${tenantMetadata.rds_proxy_endpoint}, Database: ${tenantMetadata.database}`,
    );
  } else {
    console.log(
      `[Tenant Router] Could not resolve DB info for brand ${brand_id}`,
    );
  }
  res.status(200).json(tenantMetadata);
});

// Create a new tenant
router.post("/create", async (req, res) => {
  const {
    brand_id,
    shard_id,
    rds_proxy_endpoint,
    database,
    storage_service,
    user,
    password,
    port,
    status,
    speed_key,
    app_id_mapping = "",
  } = req.body;

  // Basic validation
  if (
    !brand_id ||
    !shard_id ||
    !rds_proxy_endpoint ||
    !database ||
    !storage_service ||
    !user ||
    !password
  ) {
    return res.status(400).json({ error: "missing_required_fields" });
  }

  try {
    const created = await cdsService.createTenant({
      brand_id,
      shard_id,
      rds_proxy_endpoint,
      database,
      storage_service,
      user,
      password,
      port,
      status,
      speed_key,
      app_id_mapping,
    });

    return res.status(201).json(created);
  } catch (err) {
    // Duplicate key
    if (err && err.code === 11000) {
      return res.status(409).json({ error: "brand_id_already_exists" });
    }
    console.error("[Routes] Error creating tenant:", err.stack || err.message);
    return res.status(500).json({ error: "internal_error" });
  }
});

// Deployment service: upsert mapping
router.post("/cds/mappings", async (req, res) => {
  try {
    const mapping = await cdsService.upsertMapping(req.body || {});
    return res.status(200).json(mapping);
  } catch (err) {
    console.error(
      "[Routes] Error upserting mapping:",
      err.stack || err.message,
    );
    return res.status(500).json({ error: "internal_error" });
  }
});

router.get("/cds/mappings/:brand_id", async (req, res) => {
  try {
    const mapping = await cdsService.getMapping(req.params.brand_id);
    if (!mapping) return res.status(404).json({ error: "not_found" });
    return res.status(200).json(mapping);
  } catch (err) {
    console.error("[Routes] Error fetching mapping:", err.stack || err.message);
    return res.status(500).json({ error: "internal_error" });
  }
});

router.delete("/cds/mappings/:brand_id", async (req, res) => {
  try {
    await cdsService.deleteMapping(req.params.brand_id);
    return res.status(204).send();
  } catch (err) {
    console.error("[Routes] Error deleting mapping:", err.stack || err.message);
    return res.status(500).json({ error: "internal_error" });
  }
});

// Find tenants by plaintext credentials
router.post("/find-by-credentials", async (req, res) => {
  const { user, brand_id } = req.body;
  if (!user || !brand_id)
    return res.status(400).json({ error: "missing_required_fields" });

  try {
    const matches = await cdsService.findTenantsByCredentials(user, brand_id);
    return res.status(200).json({ count: matches.length, tenants: matches });
  } catch (err) {
    console.error(
      "[Routes] Error finding tenants by credentials:",
      err.stack || err.message,
    );
    return res.status(500).json({ error: "internal_error" });
  }
});

module.exports = router;
