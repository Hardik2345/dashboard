const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const { createApiKeyAuthMiddleware } = require('../middlewares/apiKeyAuth');
const logger = require('../utils/logger');

function buildShopifyRouter(sequelize) {
  const router = express.Router();
  const apiKeyAuth = createApiKeyAuthMiddleware(sequelize, ['upload:files']);

  router.post('/upload-file', apiKeyAuth, async (req, res) => {
    try {
      const { filename, file_data } = req.body;
      const { brandKey } = req;

      if (!filename || !file_data) {
        return res.status(400).json({
          success: false,
          message: 'filename and file_data are required',
        });
      }

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
          filename,
          httpMethod: 'POST',
          mimeType: 'application/octet-stream',
          resource: 'FILE',
        },
      };

      logger.info(`[Shopify] Creating staged upload for ${filename}...`);
      const stagedUploadResult = await axios.post(
        graphqlUrl,
        {
          query: stagedUploadsQuery,
          variables: stagedUploadsVariables,
        },
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
        },
      );

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
      const s3Url = target.url;
      const resourceUrl = target.resourceUrl;
      const form = new FormData();

      target.parameters.forEach(({ name, value }) => {
        form.append(name, value);
      });

      const fileBuffer = Buffer.from(file_data, 'base64');
      form.append('file', fileBuffer, { filename });

      try {
        await axios.post(s3Url, form, {
          headers: form.getHeaders(),
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 30000,
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

      logger.info('[Shopify] Creating file resource in Shopify...');
      const createFileResult = await axios.post(
        graphqlUrl,
        {
          query: createFileQuery,
          variables: createFileVariables,
        },
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
        },
      );

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
      return res.json({
        success: true,
        shopify_file_id: uploadedFile.id,
        url: uploadedFile.preview?.image?.url || null,
        filename: uploadedFile.alt,
        created_at: uploadedFile.createdAt,
      });
    } catch (err) {
      console.error('Shopify upload error:', err.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload file to Shopify',
        error: err.message,
      });
    }
  });

  return router;
}

module.exports = { buildShopifyRouter };
