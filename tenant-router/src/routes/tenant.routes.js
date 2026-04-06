const express = require("express");
const router = express.Router();
const tenantRouterService = require("../services/tenantRouter.service");
const cdsService = require("../services/cds.service");
const axios = require("axios");
const socketUtils = require("../utils/socket");


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
router.post("/add", async (req, res) => {
  const dataset = req.body;
  
  const pipelineApi = process.env.TENANT_ONBOARD_API;
  const pipelineKey = process.env.X_PIPELINE_KEY;

  if (!pipelineApi || !pipelineKey) {
    console.error("[Routes] TENANT_ONBOARD_API or X_PIPELINE_KEY not configured");
    return res.status(500).json({ error: "onboarding_api_not_configured" });
  }

  console.log(`[Tenant Router] Forwarding /tenant/add request to: ${pipelineApi}`);

  try {
    const response = await axios.post(pipelineApi, dataset, {
      headers: {
        "x-pipeline-key": pipelineKey,
        "Content-Type": "application/json"
      }
    });

    console.log(`[Tenant Router] Pipeline response: ${response.status}`);
    return res.status(response.status).json(response.data);
  } catch (err) {
    const errorData = err.response?.data || { message: err.message };
    const statusCode = err.response?.status || 500;

    console.error(`[Routes] Error forwarding to pipeline (${statusCode}):`, errorData);
    return res.status(statusCode).json({
      error: "pipeline_forwarding_failed",
      details: errorData
    });
  }
});

// Endpoint to receive real-time logs from the pipeline orchestrator
router.post("/onboard/logs", async (req, res) => {
  const pipelineKey = req.headers["x-pipeline-key"];
  const expectedKey = process.env.X_PIPELINE_KEY;

  // Security Check
  if (!pipelineKey || pipelineKey !== expectedKey) {
    console.warn(`[Logs] Unauthorized log attempt with key: ${pipelineKey}`);
    return res.status(401).json({ error: "unauthorized_pipeline_key" });
  }

  const { brand_id, brand_name, log } = req.body;

  if (!brand_id || !log) {
    return res.status(400).json({ error: "missing_required_fields" });
  }

  console.log(`[Logs] Received log for brand ${brand_id} (${brand_name}): ${log.substring(0, 50)}...`);

  // Broadcast to all connected clients via Socket.io
  socketUtils.emitOnboardingLog({
    brand_id,
    brand_name,
    log,
    timestamp: new Date().toISOString()
  });

  return res.status(200).json({ success: true });
});

// GET all brands mapped by brand_num
router.get("/brands", async (req, res) => {

  try {
    const tenants = await cdsService.getAllTenants();
    const response = {};
    tenants.forEach((t) => {
      if (t.brand_num != null) {
        response[t.brand_num] = t.brand_id;
      }
    });
    res.status(200).json(response);
  } catch (err) {
    console.error("[Routes] Error getting brands list:", err.stack || err.message);
    res.status(500).json({ error: "internal_error" });
  }
});

// Create a new tenant
router.post("/create", async (req, res) => {
  const {
    brand_id,
    shard_id,
    rds_proxy_endpoint,
    database,
    user,
    password,
    port,
    status,
    speed_key,
    app_id_mapping = "",
    brand_num,
    shop_name,
    api_version,
    access_token,
    session_url = "",
    db_host,
  } = req.body;

  // Basic validation
  // Better validation giving missing fields breakdown
  const required = {
    shard_id, rds_proxy_endpoint, database, user, password,
    shop_name, api_version, access_token, db_host
  };
  const missing = [];
  
  for (const [k, v] of Object.entries(required)) {
    if (!v) missing.push(k);
  }
  if (brand_num === undefined) {
    missing.push("brand_num");
  }

  if (missing.length > 0) {
    return res.status(400).json({ 
      error: "missing_required_fields", 
      missing: missing 
    });
  }

  try {
    const created = await cdsService.createTenant({
      brand_id,
      shard_id,
      rds_proxy_endpoint,
      database,
      user,
      password,
      port,
      status,
      speed_key,
      app_id_mapping,
      brand_num,
      shop_name,
      api_version,
      access_token,
      session_url,
      db_host,
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
