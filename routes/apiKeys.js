const express = require('express');
const ApiKeyService = require('../services/apiKeyService');
const { requireAuthor } = require('../middlewares/auth');

/**
 * Admin API Keys Router
 * Endpoints for managing API keys (create, list, revoke, rotate)
 * Accessible by authenticated admins/authors only
 */

function buildApiKeysRouter(sequelize) {
  const router = express.Router();
  const apiKeyService = new ApiKeyService(sequelize);

  /**
   * POST /admin/api-keys
   * Create a new API key for a brand
   * 
   * Body:
   *   {
   *     "brand_key": "PTS",
   *     "name": "Mobile App Upload",
   *     "permissions": ["upload:files", "read:files"]
   *   }
   * 
   * Response:
   *   {
   *     "success": true,
   *     "plain_key": "sk_prod_abc123...",  // Return once, user must save
   *     "api_key": { id, name, brand_key, permissions, created_at, expires_at, is_active }
   *   }
   */
  router.post('/admin/api-keys', requireAuthor, async (req, res) => {
    try {
      const { brand_key, name, permissions } = req.body;

      if (!brand_key) {
        return res.status(400).json({ success: false, message: 'brand_key is required' });
      }

      const userEmail = req.user?.email || req.apiKey?.created_by_email || 'system';
      const result = await apiKeyService.createApiKey(
        brand_key,
        name || '',
        permissions || [],
        userEmail
      );

      if (!result.success) {
        return res.status(500).json(result);
      }

      res.json({
        success: true,
        plain_key: result.plainKey, // IMPORTANT: Return once, user must save immediately
        api_key: result.apiKey,
      });
    } catch (err) {
      console.error('Error creating API key:', err);
      res.status(500).json({ success: false, message: 'Failed to create API key' });
    }
  });

  /**
   * GET /admin/api-keys
   * List all API keys for a brand (masks the key_hash)
   * 
   * Query:
   *   ?brand_key=PTS
   * 
   * Response:
   *   {
   *     "success": true,
   *     "keys": [
   *       { id, name, brand_key, permissions, created_at, last_used_at, expires_at, is_active, revoked_at },
   *       ...
   *     ]
   *   }
   */
  router.get('/admin/api-keys', requireAuthor, async (req, res) => {
    try {
      const { brand_key } = req.query;

      if (!brand_key) {
        return res.status(400).json({ success: false, message: 'brand_key query param is required' });
      }

      const result = await apiKeyService.listKeysByBrand(brand_key);

      if (!result.success) {
        return res.status(500).json(result);
      }

      res.json(result);
    } catch (err) {
      console.error('Error listing API keys:', err);
      res.status(500).json({ success: false, message: 'Failed to list API keys' });
    }
  });

  /**
   * POST /admin/api-keys/:id/revoke
   * Revoke an API key (mark as inactive)
   * 
   * Response:
   *   { "success": true, "message": "API key revoked" }
   */
  router.post('/admin/api-keys/:id/revoke', requireAuthor, async (req, res) => {
    try {
      const { id } = req.params;

      const result = await apiKeyService.revokeKey(id);

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.json(result);
    } catch (err) {
      console.error('Error revoking API key:', err);
      res.status(500).json({ success: false, message: 'Failed to revoke API key' });
    }
  });

  /**
   * POST /admin/api-keys/:id/rotate
   * Rotate an API key: revoke old, create new with same permissions
   * 
   * Response:
   *   {
   *     "success": true,
   *     "plain_key": "sk_prod_new...",  // Return once, user must save
   *     "api_key": { ... }
   *   }
   */
  router.post('/admin/api-keys/:id/rotate', requireAuthor, async (req, res) => {
    try {
      const { id } = req.params;

      const result = await apiKeyService.rotateKey(id);

      if (!result.success) {
        return res.status(500).json(result);
      }

      res.json({
        success: true,
        plain_key: result.plainKey, // IMPORTANT: Return once, user must save immediately
        api_key: result.apiKey,
      });
    } catch (err) {
      console.error('Error rotating API key:', err);
      res.status(500).json({ success: false, message: 'Failed to rotate API key' });
    }
  });

  return router;
}

module.exports = { buildApiKeysRouter };
