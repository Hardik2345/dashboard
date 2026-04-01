const express = require('express');
const ApiKeyService = require('../services/apiKeyService');
const { requireTrustedAuthor } = require('../middlewares/identityEdge');

function buildApiKeysRouter(sequelize) {
  const router = express.Router();
  const apiKeyService = new ApiKeyService(sequelize);

  const requireAuthorOrPipeline = (req, res, next) => {
    const pipelineKey = req.headers['x-pipeline-key'];
    const expectedKey = process.env.PIPELINE_AUTH_HEADER;
    const backupKey = process.env.X_PIPELINE_KEY;
    const isValid =
      (expectedKey && pipelineKey === expectedKey) ||
      (backupKey && pipelineKey === backupKey);

    if (pipelineKey && isValid) {
      req.user = { id: 'pipeline-service', role: 'admin', isAuthor: true };
      req.isAuthenticated = () => true;
      return next();
    }

    return requireTrustedAuthor(req, res, next);
  };

  router.post('/admin/api-keys', requireAuthorOrPipeline, async (req, res) => {
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
        userEmail,
        false,
      );

      if (!result.success) {
        return res.status(500).json(result);
      }

      return res.json({
        success: true,
        plain_key: result.plainKey,
        api_key: result.apiKey,
      });
    } catch (err) {
      console.error('Error creating API key:', err);
      return res.status(500).json({ success: false, message: 'Failed to create API key' });
    }
  });

  router.get('/admin/api-keys', requireAuthorOrPipeline, async (req, res) => {
    try {
      const { brand_key } = req.query;

      if (!brand_key) {
        return res.status(400).json({ success: false, message: 'brand_key query param is required' });
      }

      const result = await apiKeyService.listKeysByBrand(brand_key);
      if (!result.success) {
        return res.status(500).json(result);
      }

      return res.json(result);
    } catch (err) {
      console.error('Error listing API keys:', err);
      return res.status(500).json({ success: false, message: 'Failed to list API keys' });
    }
  });

  router.post('/admin/api-keys/:id/revoke', requireAuthorOrPipeline, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await apiKeyService.revokeKey(id);

      if (!result.success) {
        return res.status(404).json(result);
      }

      return res.json(result);
    } catch (err) {
      console.error('Error revoking API key:', err);
      return res.status(500).json({ success: false, message: 'Failed to revoke API key' });
    }
  });

  router.post('/admin/api-keys/:id/rotate', requireAuthorOrPipeline, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await apiKeyService.rotateKey(id);

      if (!result.success) {
        return res.status(500).json(result);
      }

      return res.json({
        success: true,
        plain_key: result.plainKey,
        api_key: result.apiKey,
      });
    } catch (err) {
      console.error('Error rotating API key:', err);
      return res.status(500).json({ success: false, message: 'Failed to rotate API key' });
    }
  });

  return router;
}

module.exports = { buildApiKeysRouter };
