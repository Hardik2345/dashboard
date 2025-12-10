const express = require('express');
const { createApiKeyAuthMiddleware } = require('../middleware/apiKeyAuth');

/**
 * Shopify Integration Router
 * Endpoints for uploading files to Shopify
 * Protected by API key authentication
 */

function buildShopifyRouter(sequelize) {
  const router = express.Router();
  const apiKeyAuth = createApiKeyAuthMiddleware(sequelize, ['upload:files']);

  /**
   * POST /shopify/upload-file
   * Upload a file to Shopify
   * Protected by API key auth with 'upload:files' permission
   * Rate limited: 100 requests per minute
   * 
   * Headers:
   *   Authorization: Bearer sk_prod_xxxxx
   * 
   * Query:
   *   ?brand_key=PTS
   * 
   * Body:
   *   {
   *     "filename": "card-image.png",
   *     "file_data": "base64_encoded_string"
   *   }
   * 
   * Response:
   *   {
   *     "success": true,
   *     "shopify_file_id": "gid://shopify/File/123456",
   *     "url": "https://cdn.shopify.com/...",
   *     "filename": "card-image.png"
   *   }
   */
  router.post('/upload-file', apiKeyAuth, async (req, res) => {
    try {
      const { filename, file_data } = req.body;
      const { brandKey } = req;

      // Validate input
      if (!filename || !file_data) {
        return res.status(400).json({
          success: false,
          message: 'filename and file_data are required',
        });
      }

      if (!Buffer.isBuffer(Buffer.from(file_data, 'base64'))) {
        return res.status(400).json({
          success: false,
          message: 'file_data must be valid base64',
        });
      }

      // Get Shopify credentials from environment
      const shopName = process.env[`SHOP_NAME_${brandKey}`];
      const apiVersion = process.env[`API_VERSION_${brandKey}`] || '2024-01';
      const accessToken = process.env[`ACCESS_TOKEN_${brandKey}`];

      if (!shopName || !accessToken) {
        return res.status(500).json({
          success: false,
          message: `Shopify credentials not configured for brand ${brandKey}`,
        });
      }

      // Call Shopify API to upload file
      const shopifyUrl = `https://${shopName}.myshopify.com/admin/api/${apiVersion}/files.json`;

      const response = await fetch(shopifyUrl, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file: {
            attachment: file_data,
            filename: filename,
          },
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error('Shopify API error:', responseData);
        return res.status(response.status).json({
          success: false,
          message: 'Failed to upload file to Shopify',
          error: responseData.errors || responseData.error,
        });
      }

      // Extract file info from Shopify response
      const uploadedFile = responseData.file || responseData.files?.[0];

      if (!uploadedFile) {
        return res.status(500).json({
          success: false,
          message: 'Unexpected Shopify response format',
        });
      }

      res.json({
        success: true,
        shopify_file_id: uploadedFile.id,
        url: uploadedFile.url,
        filename: uploadedFile.filename,
        size: uploadedFile.size,
        created_at: uploadedFile.created_at,
      });
    } catch (err) {
      console.error('Shopify upload error:', err);
      res.status(500).json({
        success: false,
        message: 'Failed to upload file to Shopify',
        error: err.message,
      });
    }
  });

  return router;
}

module.exports = { buildShopifyRouter };
