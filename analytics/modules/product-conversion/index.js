const express = require('express');
const { requireTrustedAuthor } = require('../../shared/middleware/identityEdge');
const { brandContext } = require('../../shared/middleware/brandContext');
const { buildProductConversionController } = require('./controller');

function buildProductConversionRouter() {
  const router = express.Router();
  const controller = buildProductConversionController();

  router.get('/product-conversion', requireTrustedAuthor, brandContext, controller.productConversion);
  router.get('/product-conversion/export', requireTrustedAuthor, brandContext, controller.productConversionCsv);

  return router;
}

module.exports = { buildProductConversionRouter };
