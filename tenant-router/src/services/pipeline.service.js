const PipelineCreds = require("../models/pipelineCreds.model");

/**
 * Creates a new pipeline credentials record.
 * @param {Object} data
 * @returns {Promise<Object>}
 */
const createPipelineCreds = async (data) => {
  const pipelineCreds = new PipelineCreds(data);
  await pipelineCreds.save();
  return pipelineCreds.toObject();
};

const getPipelineBrands = async () => {
  const brands = await PipelineCreds.find({}, "brand_id db_database").lean();
  const result = {};
  brands.forEach((b) => {
    result[b.brand_id] = b.db_database;
  });
  return result;
};

/**
 * Returns a specific pipeline credentials record by brand_id.
 * @param {number} brandId
 * @returns {Promise<Object|null>}
 */
const getPipelineCredsById = async (brandId) => {
  return PipelineCreds.findOne({ brand_id: brandId }).lean();
};

const validateSpeedKey = async ({ brandKey, speedKey }) => {
  const normalizedBrandKey = (brandKey || "").toString().trim().toUpperCase();
  const presentedSpeedKey = (speedKey || "").toString().trim();

  if (!normalizedBrandKey || !presentedSpeedKey) {
    return { valid: false, reason: "missing_brand_or_speed_key" };
  }

  const doc = await PipelineCreds.findOne({
    $or: [
      { brand_tag: new RegExp(`^${normalizedBrandKey}$`, "i") },
      { db_database: new RegExp(`^${normalizedBrandKey}$`, "i") },
      { brand_name: new RegExp(`^${normalizedBrandKey}$`, "i") },
    ],
  }).lean();

  if (!doc) {
    return { valid: false, reason: "brand_not_found" };
  }

  const decryptedSpeedKey = PipelineCreds.decrypt(doc.speed_key || "");
  if (!decryptedSpeedKey || decryptedSpeedKey !== presentedSpeedKey) {
    return { valid: false, reason: "invalid_speed_key" };
  }

  return {
    valid: true,
    brandKey: (doc.brand_tag || normalizedBrandKey).toString().trim().toUpperCase(),
    brandId: doc.brand_id,
  };
};

/**
 * Updates an existing pipeline credentials record by ObjectId.
 * Uses .save() instead of .findOneAndUpdate() to trigger the pre-save
 * middleware for encryption.
 * @param {string} id - The MongoDB ObjectId of the document
 * @param {Object} data - Update payload
 * @returns {Promise<Object|null>}
 */
const updatePipelineCredsById = async (id, data) => {
  const doc = await PipelineCreds.findById(id);
  if (!doc) return null;

  // Apply updates
  Object.assign(doc, data);
  await doc.save();
  return doc.toObject();
};

module.exports = {
  createPipelineCreds,
  getPipelineBrands,
  getPipelineCredsById,
  validateSpeedKey,
  updatePipelineCredsById,
};
