const express = require('express');
const { requireAuthor } = require('../middlewares/auth');
const { buildAdjustmentBucketsController } = require('../controllers/adjustmentBucketsController');

function buildAdjustmentsRouter(deps) {
  const router = express.Router();
  const controller = buildAdjustmentBucketsController(deps);

  router.get('/adjustments/preview', requireAuthor, controller.previewAdjustments);
  router.post('/adjustments/apply', requireAuthor, controller.applyAdjustments);

  return router;
}

module.exports = { buildAdjustmentsRouter };
