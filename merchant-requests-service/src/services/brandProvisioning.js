const BrandTodoistConfig = require("../models/BrandTodoistConfig");

const MERCHANT_RAISED_SECTION_NAME = "Merchant Raised";

function buildSectionFallback(sectionId) {
  return {
    submitted: sectionId,
    assigned: sectionId,
    done: sectionId,
  };
}

// Returns true if we own the provisioning slot (may create or reclaim a failed doc).
// Uses create-then-catch-11000 for concurrency safety without transactions.
async function _claimProvisioningSlot(brand_key) {
  try {
    await BrandTodoistConfig.create({ brand_key, provisioning_status: "pending" });
    return true;
  } catch (err) {
    if (err?.code === 11000) {
      // Doc already exists — only reclaim if it's in "failed" state
      const result = await BrandTodoistConfig.updateOne(
        { brand_key, provisioning_status: "failed" },
        { $set: { provisioning_status: "pending", provisioning_error: "" } },
      );
      return result.modifiedCount > 0;
    }
    throw err;
  }
}

async function _findOrCreateMerchantRaisedSection(projectId, { todoistClient }) {
  const existingSections = await todoistClient.listSections(projectId);
  const existing = existingSections.find(
    (s) => String(s.name || "").toLowerCase() === MERCHANT_RAISED_SECTION_NAME.toLowerCase(),
  );
  if (existing) {
    return String(existing.id || existing.section_id || "");
  }
  const created = await todoistClient.createSection(MERCHANT_RAISED_SECTION_NAME, projectId);
  return String(created.id || created.section_id || "");
}

// Auto-creates a Todoist project for the brand and populates sections.
// Idempotent: if partially provisioned (project_id already saved), resumes from there.
async function provisionBrandProject(brand_key, { todoistClient, config }) {
  const claimed = await _claimProvisioningSlot(brand_key);
  if (!claimed) return;

  try {
    const brandConfig = await BrandTodoistConfig.findOne({ brand_key });
    let projectId = brandConfig?.todoist_project_id;

    if (!projectId) {
      const projectName = `${config.todoist.projectNamePrefix || "Datum"} - ${brand_key}`;
      const project = await todoistClient.createProject(projectName);
      projectId = String(project.id || project.project_id || "");
      // Save project_id immediately so a retry doesn't create a duplicate project
      await BrandTodoistConfig.updateOne({ brand_key }, { $set: { todoist_project_id: projectId } });
    }

    const merchantRaisedSectionId = await _findOrCreateMerchantRaisedSection(projectId, { todoistClient });

    await BrandTodoistConfig.updateOne(
      { brand_key },
      {
        $set: {
          merchant_raised_section_id: merchantRaisedSectionId,
          section_by_status: buildSectionFallback(merchantRaisedSectionId),
          provisioning_status: "ready",
          provisioning_mode: "auto",
          provisioning_error: "",
        },
      },
    );
  } catch (err) {
    await BrandTodoistConfig.updateOne(
      { brand_key },
      { $set: { provisioning_status: "failed", provisioning_error: err?.message || String(err) } },
    );
    console.error(`[merchant-requests] provisioning failed for ${brand_key}:`, err.message);
  }
}

// Links an existing Todoist project to a brand. Smart-imports sections by name,
// creates any missing ones. Throws 409 if brand already has a ready config.
async function linkBrandProject(brand_key, todoist_project_id, { todoistClient }) {
  const existing = await BrandTodoistConfig.findOne({ brand_key });
  if (existing?.provisioning_status === "ready") {
    const err = new Error("brand_already_provisioned");
    err.statusCode = 409;
    throw err;
  }

  // Validate the project exists (getProject throws if not found)
  await todoistClient.getProject(todoist_project_id);

  const merchantRaisedSectionId = await _findOrCreateMerchantRaisedSection(todoist_project_id, { todoistClient });

  await BrandTodoistConfig.updateOne(
    { brand_key },
    {
      $set: {
        todoist_project_id,
        merchant_raised_section_id: merchantRaisedSectionId,
        section_by_status: buildSectionFallback(merchantRaisedSectionId),
        provisioning_status: "ready",
        provisioning_mode: "manual",
        provisioning_error: "",
      },
    },
    { upsert: true },
  );

  return BrandTodoistConfig.findOne({ brand_key });
}

// Returns the ready brand config or triggers async provisioning.
// Callers that need the config to proceed should check the returned `ready` flag.
async function getOrProvisionBrandConfig(brand_key, deps) {
  const existing = await BrandTodoistConfig.findOne({ brand_key });
  if (existing?.provisioning_status === "ready") {
    return { config: existing, ready: true };
  }
  if (existing?.provisioning_status === "pending") {
    return { ready: false };
  }
  // Not found or failed → kick off provisioning async
  provisionBrandProject(brand_key, deps).catch((err) => {
    console.error(`[merchant-requests] provision trigger error for ${brand_key}:`, err.message);
  });
  return { ready: false };
}

// Returns the ready config for a brand, or null if not provisioned.
async function getBrandConfig(brand_key) {
  return BrandTodoistConfig.findOne({ brand_key, provisioning_status: "ready" });
}

// Re-triggers provisioning for all brands that previously failed.
async function retryFailedProvisionings(deps) {
  const failed = await BrandTodoistConfig.find({ provisioning_status: "failed" }).lean();
  for (const cfg of failed) {
    provisionBrandProject(cfg.brand_key, deps).catch((err) => {
      console.error(`[merchant-requests] retry provision error for ${cfg.brand_key}:`, err.message);
    });
  }
}

module.exports = {
  MERCHANT_RAISED_SECTION_NAME,
  buildSectionFallback,
  getBrandConfig,
  getOrProvisionBrandConfig,
  linkBrandProject,
  provisionBrandProject,
  retryFailedProvisionings,
};
