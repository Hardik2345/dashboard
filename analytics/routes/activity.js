const express = require('express');
const { heartbeat } = require('../controllers/activityController');
const { requireAuth } = require('../middlewares/auth');

function buildActivityRouter({ sessionTrackingEnabled, recordSessionActivity }) {
  const router = express.Router();
  router.post('/heartbeat', ...heartbeat(requireAuth, sessionTrackingEnabled, recordSessionActivity));
  return router;
}

module.exports = { buildActivityRouter };
