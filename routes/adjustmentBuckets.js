const express = require('express');
const { requireAuthor } = require('../middlewares/auth');
const { buildAdjustmentBucketsController } = require('../controllers/adjustmentBucketsController');

function buildAdjustmentBucketsRouter(deps) {
  const router = express.Router();
  const controller = buildAdjustmentBucketsController(deps);

  router.get('/', requireAuthor, controller.listBuckets);
  router.post('/', requireAuthor, controller.createBucket);
  router.put('/:id', requireAuthor, controller.updateBucket);
  router.delete('/:id', requireAuthor, controller.deactivateBucket);
  router.post('/:id/activate', requireAuthor, controller.activateBucket);

  return router;
}

module.exports = { buildAdjustmentBucketsRouter };
