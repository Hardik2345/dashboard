const express = require("express");
const router = express.Router();
const pipelineService = require("../services/pipeline.service");

// Bypass authentication if x-pipeline-key matches
const bypassAuth = (req, res, next) => {
  const pipelineKey = req.headers["x-pipeline-key"];
  const expectedKey = process.env.X_PIPELINE_KEY;

  if (pipelineKey && pipelineKey === expectedKey) {
    req.isBypassed = true;
    return next();
  }

  if (pipelineKey && pipelineKey !== expectedKey) {
    return res.status(401).json({ error: "unauthorized_pipeline_key" });
  }

  next();
};

router.use(bypassAuth);

// POST /pipeline/credentials/create
router.post("/credentials/create", async (req, res) => {
  const {
    brand_id,
    brand_name,
    db_host,
    port,
    db_password,
    db_user,
    access_token,
    api_version,
    app_id_mapping,
    brand_tag,
    db_database,
    my_sql_url,
    shop_name,
    speed_key = "",
  } = req.body;

  // Basic validation
  if (
    brand_id === undefined ||
    !brand_name ||
    !db_host ||
    !port ||
    !db_password ||
    !db_user ||
    !access_token ||
    !api_version ||
    !app_id_mapping ||
    !brand_tag ||
    !db_database ||
    !my_sql_url ||
    !shop_name
  ) {
    return res.status(400).json({ error: "missing_required_fields" });
  }

  try {
    const created = await pipelineService.createPipelineCreds({
      brand_id,
      brand_name,
      db_host,
      port,
      db_password,
      db_user,
      access_token,
      api_version,
      app_id_mapping,
      brand_tag,
      db_database,
      my_sql_url,
      shop_name,
      speed_key,
    });
    return res.status(201).json(created);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "duplicate_brand_id_or_database" });
    }
    console.error("[PipelineRoutes] Error creating pipeline creds:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

// GET /pipeline/brands
router.get("/brands", async (req, res) => {
  try {
    const brands = await pipelineService.getPipelineBrands();
    return res.status(200).json(brands);
  } catch (err) {
    console.error("[PipelineRoutes] Error fetching pipeline brands:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

// GET /pipeline/brands/:id
router.get("/brands/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const creds = await pipelineService.getPipelineCredsById(Number(id));
    if (!creds) {
      return res.status(404).json({ error: "brand_not_found" });
    }
    return res.status(200).json(creds);
  } catch (err) {
    console.error("[PipelineRoutes] Error fetching pipeline creds by id:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

router.post("/validate-speed-key", async (req, res) => {
  const authHeader = (req.headers.authorization || "").toString();
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const speedKey = bearerMatch ? bearerMatch[1].trim() : "";
  const brandKey = (req.body?.brand_key || req.query?.brand_key || "").toString();

  try {
    const result = await pipelineService.validateSpeedKey({
      brandKey,
      speedKey,
    });

    if (!result.valid) {
      return res.status(401).json({ valid: false, reason: result.reason });
    }

    return res.status(200).json({
      valid: true,
      brand_key: result.brandKey,
      brand_id: result.brandId,
    });
  } catch (err) {
    console.error("[PipelineRoutes] Error validating speed key:", err);
    return res.status(500).json({ valid: false, error: "internal_error" });
  }
});

// PUT /pipeline/credentials/:id
router.put("/credentials/:id", async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  // Basic validation to ensure the ID is a valid 24-char hex string (Mongoose ObjectId format)
  if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
    return res.status(400).json({ error: "invalid_id_format" });
  }

  // Ensure object isn't completely empty before trying to update
  if (!updateData || Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: "empty_update_payload" });
  }

  try {
    const updated = await pipelineService.updatePipelineCredsById(
      id,
      updateData,
    );
    if (!updated) {
      return res.status(404).json({ error: "credential_not_found" });
    }
    return res.status(200).json(updated);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "duplicate_brand_id_or_database" });
    }
    console.error("[PipelineRoutes] Error updating pipeline creds:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

module.exports = router;
