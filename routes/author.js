const express = require('express');
const { authorMe } = require('../controllers/authController');
const { requireAuth } = require('../middlewares/auth');

function buildAuthorRouter() {
  const router = express.Router();
  router.get('/me', requireAuth, authorMe());
  return router;
}

module.exports = { buildAuthorRouter };
