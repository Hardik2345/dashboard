const express = require('express');
const { requirePermission } = require('../../shared/middleware/identityEdge');
const { brandContext } = require('../../shared/middleware/brandContext');
const { buildProductConversionController } = require('./controller');

function buildProductConversionRouter() {
  const router = express.Router();
  const controller = buildProductConversionController();

  router.get('/product-conversion', requirePermission('product_conversion'), brandContext, controller.productConversion);
  router.get('/product-conversion/export', requirePermission('product_conversion'), brandContext, controller.productConversionCsv);

  return router;
}

module.exports = { buildProductConversionRouter };
