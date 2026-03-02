const express = require("express");
const router = express.Router();
const pipelineService = require("../services/pipeline.service");

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

module.exports = router;
