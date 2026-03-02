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

module.exports = {
  createPipelineCreds,
  getPipelineBrands,
  getPipelineCredsById,
};
