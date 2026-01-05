const express = require('express');
const { requireAuthor } = require('../middlewares/auth');
const {
  listSettings,
  updateMode,
  updateSettings,
  listWhitelist,
  addWhitelist,
  deleteWhitelist,
} = require('../controllers/accessControlController');

function buildAccessControlRouter({ sequelize, getAccessSettings, bustAccessCache }) {
  const router = express.Router();

  router.get('/', ...listSettings(requireAuthor, getAccessSettings));
  router.post('/mode', ...updateMode(requireAuthor, sequelize, bustAccessCache));
  router.post('/settings', ...updateSettings(requireAuthor, sequelize, bustAccessCache));
  router.get('/whitelist', ...listWhitelist(requireAuthor, sequelize));
  router.post('/whitelist', ...addWhitelist(requireAuthor, sequelize, bustAccessCache));
  router.delete('/whitelist/:id', ...deleteWhitelist(requireAuthor, sequelize, bustAccessCache));

  return router;
}

module.exports = { buildAccessControlRouter };
