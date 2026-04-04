const { handleControllerError } = require('../../shared/middleware/handleControllerError');
const {
  buildProductConversionService,
} = require('../../services/productConversionService');

function buildProductConversionController() {
  const productConversionService = buildProductConversionService();

  return {
    productConversion: async (req, res) => {
      try {
        const normalized = productConversionService.normalizeProductConversionRequest(req.query);
        if (!normalized.ok) return res.status(normalized.status).json(normalized.body);
        const conn = req.brandDb?.sequelize;
        if (!conn) return res.status(500).json({ error: 'Brand DB connection unavailable' });
        return res.json(
          await productConversionService.getProductConversion({ ...normalized.spec, conn }),
        );
      } catch (e) {
        return handleControllerError(res, e, 'product-conversion failed');
      }
    },

    productConversionCsv: async (req, res) => {
      try {
        const normalized = productConversionService.normalizeProductConversionRequest(req.query);
        if (!normalized.ok) return res.status(normalized.status).json(normalized.body);
        const conn = req.brandDb?.sequelize;
        if (!conn) return res.status(500).json({ error: 'Brand DB connection unavailable' });
        const exportResult = await productConversionService.getProductConversionCsv({
          ...normalized.spec,
          conn,
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
        return res.send(exportResult.csv);
      } catch (e) {
        return handleControllerError(res, e, 'product-conversion-csv failed');
      }
    },
  };
}

module.exports = { buildProductConversionController };
