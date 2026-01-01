const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const { createApiKeyAuthMiddleware } = require('../middlewares/apiKeyAuth');
const logger = require('../utils/logger');

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

      const graphqlUrl = `https://${shopName}.myshopify.com/admin/api/${apiVersion}/graphql.json`;

      // Step 1: Create staged upload
      const stagedUploadsQuery = `mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            resourceUrl
            url
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }`;

      const stagedUploadsVariables = {
        input: {
          filename: filename,
          httpMethod: 'POST',
          mimeType: 'application/octet-stream',
          resource: 'FILE',
        },
      };

      logger.info(`[Shopify] Creating staged upload for ${filename}...`);
      const stagedUploadResult = await axios.post(graphqlUrl, {
        query: stagedUploadsQuery,
        variables: stagedUploadsVariables,
      }, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });

      const stagedTargets = stagedUploadResult.data?.data?.stagedUploadsCreate?.stagedTargets;
      const userErrors = stagedUploadResult.data?.data?.stagedUploadsCreate?.userErrors;

      if (userErrors && userErrors.length > 0) {
        console.error('Staged upload errors:', userErrors);
        return res.status(400).json({
          success: false,
          message: 'Failed to create staged upload',
          errors: userErrors,
        });
      }

      if (!stagedTargets || !stagedTargets[0]) {
        console.error('No staged target returned:', stagedUploadResult.data);
        return res.status(500).json({
          success: false,
          message: 'No staged target returned from Shopify',
        });
      }

      const target = stagedTargets[0];
      const params = target.parameters;
      const s3Url = target.url;
      const resourceUrl = target.resourceUrl;

      // Step 2: Upload file to S3 staging location
      logger.info(`[Shopify] Uploading file to S3 staging: ${s3Url.slice(0, 50)}...`);
      const form = new FormData();

      // Add S3 parameters (must be in the exact order returned by Shopify)
      params.forEach(({ name, value }) => {
        form.append(name, value);
      });

      // Add file (convert base64 to buffer)
      const fileBuffer = Buffer.from(file_data, 'base64');
      form.append('file', fileBuffer, { filename });

      try {
        await axios.post(s3Url, form, {
          headers: form.getHeaders(),
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 30000, // 30 second timeout
        });
        logger.info('[Shopify] S3 upload completed successfully');
      } catch (s3Err) {
        console.error('S3 upload failed:', s3Err.response?.status, s3Err.response?.data || s3Err.message);
        return res.status(500).json({
          success: false,
          message: 'Failed to upload file to S3 staging',
          error: s3Err.message,
        });
      }

      // Step 3: Create file resource in Shopify
      const createFileQuery = `mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            alt
            createdAt
            fileStatus
            preview {
              image {
                url
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }`;

      const createFileVariables = {
        files: {
          alt: filename,
          contentType: 'FILE',
          originalSource: resourceUrl,
        },
      };

      logger.info(`[Shopify] Creating file resource in Shopify...`);
      const createFileResult = await axios.post(graphqlUrl, {
        query: createFileQuery,
        variables: createFileVariables,
      }, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });

      const files = createFileResult.data?.data?.fileCreate?.files;
      const fileUserErrors = createFileResult.data?.data?.fileCreate?.userErrors;

      if (fileUserErrors && fileUserErrors.length > 0) {
        console.error('File create errors:', fileUserErrors);
        return res.status(400).json({
          success: false,
          message: 'Failed to create file in Shopify',
          errors: fileUserErrors,
        });
      }

      if (!files || !files[0]) {
        console.error('No file created:', createFileResult.data);
        return res.status(500).json({
          success: false,
          message: 'File creation returned no file object',
        });
      }

      const uploadedFile = files[0];
      res.json({
        success: true,
        shopify_file_id: uploadedFile.id,
        url: uploadedFile.preview?.image?.url || null,
        filename: uploadedFile.alt,
        created_at: uploadedFile.createdAt,
      });
    } catch (err) {
      console.error('Shopify upload error:', err.message);
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
