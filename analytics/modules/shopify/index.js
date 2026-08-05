const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const { createApiKeyAuthMiddleware } = require('../../shared/middleware/apiKeyAuth');
const logger = require('../../shared/utils/logger');

function buildShopifyRouter(sequelize) {
  const router = express.Router();
  const apiKeyAuth = createApiKeyAuthMiddleware(sequelize, ['upload:files']);

  router.post('/upload-file', apiKeyAuth, async (req, res) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    try {
      const { filename, file_data } = req.body;
      const { brandKey } = req;
      const fileSizeBytes = file_data ? Buffer.byteLength(file_data, 'base64') : 0;

      logger.info('[Shopify upload] request received', {
        requestId,
        brandKey,
        filename,
        base64Length: file_data ? file_data.length : 0,
        fileSizeBytes,
      });

      if (!filename || !file_data) {
        return res.status(400).json({
          success: false,
          message: 'filename and file_data are required',
        });
      }

      const shopName = process.env[`SHOP_NAME_${brandKey}`];
      const apiVersion = process.env[`API_VERSION_${brandKey}`] || '2024-01';
      const accessToken = process.env[`ACCESS_TOKEN_${brandKey}`];

      logger.info('[Shopify upload] config resolved', {
        requestId,
        brandKey,
        shopName,
        apiVersion,
        hasAccessToken: Boolean(accessToken),
      });

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

      logger.info('[Shopify upload] stagedUploadsCreate start', {
        requestId,
        filename,
        fileSizeBytes,
      });
      const stagedStartedAt = Date.now();
      const stagedUploadResult = await axios.post(
        graphqlUrl,
        { query: stagedUploadsQuery, variables: stagedUploadsVariables },
        { headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' } },
      );
      logger.info('[Shopify upload] stagedUploadsCreate response', {
        requestId,
        status: stagedUploadResult.status,
        durationMs: Date.now() - stagedStartedAt,
        hasGraphqlErrors: Boolean(stagedUploadResult.data?.errors?.length),
      });

      const stagedTargets = stagedUploadResult.data?.data?.stagedUploadsCreate?.stagedTargets;
      const userErrors = stagedUploadResult.data?.data?.stagedUploadsCreate?.userErrors;

      if (userErrors && userErrors.length > 0) {
        console.error('Staged upload errors:', userErrors);
        return res.status(400).json({ success: false, message: 'Failed to create staged upload', errors: userErrors });
      }

      if (!stagedTargets || !stagedTargets[0]) {
        console.error('No staged target returned:', stagedUploadResult.data);
        return res.status(500).json({ success: false, message: 'No staged target returned from Shopify' });
      }

      const target = stagedTargets[0];
      const s3Url = target.url;
      const resourceUrl = target.resourceUrl;
      const form = new FormData();
      logger.info('[Shopify upload] staged target received', {
        requestId,
        parameterNames: (target.parameters || []).map((p) => p.name),
        hasResourceUrl: Boolean(resourceUrl),
        uploadHost: (() => {
          try {
            return new URL(s3Url).host;
          } catch {
            return null;
          }
        })(),
      });

      target.parameters.forEach(({ name, value }) => { form.append(name, value); });
      form.append('file', Buffer.from(file_data, 'base64'), { filename });

      try {
        logger.info('[Shopify upload] staged binary upload start', {
          requestId,
          filename,
          fileSizeBytes,
        });
        const uploadStartedAt = Date.now();
        await axios.post(s3Url, form, {
          headers: form.getHeaders(),
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 30000,
        });
        logger.info('[Shopify upload] staged binary upload complete', {
          requestId,
          durationMs: Date.now() - uploadStartedAt,
        });
      } catch (s3Err) {
        logger.error('[Shopify upload] staged binary upload failed', {
          requestId,
          status: s3Err.response?.status,
          error: s3Err.message,
          response: s3Err.response?.data,
        });
        return res.status(500).json({ success: false, message: 'Failed to upload file to S3 staging', error: s3Err.message });
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

      logger.info('[Shopify upload] fileCreate start', {
        requestId,
        filename,
        hasResourceUrl: Boolean(resourceUrl),
      });
      const createStartedAt = Date.now();
      const createFileResult = await axios.post(
        graphqlUrl,
        { query: createFileQuery, variables: { files: { alt: filename, contentType: 'FILE', originalSource: resourceUrl } } },
        { headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' } },
      );
      logger.info('[Shopify upload] fileCreate response', {
        requestId,
        status: createFileResult.status,
        durationMs: Date.now() - createStartedAt,
        hasGraphqlErrors: Boolean(createFileResult.data?.errors?.length),
      });

      const files = createFileResult.data?.data?.fileCreate?.files;
      const fileUserErrors = createFileResult.data?.data?.fileCreate?.userErrors;

      if (fileUserErrors && fileUserErrors.length > 0) {
        console.error('File create errors:', fileUserErrors);
        return res.status(400).json({ success: false, message: 'Failed to create file in Shopify', errors: fileUserErrors });
      }

      if (!files || !files[0]) {
        console.error('No file created:', createFileResult.data);
        return res.status(500).json({ success: false, message: 'File creation returned no file object' });
      }

      const uploadedFile = files[0];
      logger.info('[Shopify upload] complete', {
        requestId,
        shopifyFileId: uploadedFile.id,
        fileStatus: uploadedFile.fileStatus,
        hasPreviewUrl: Boolean(uploadedFile.preview?.image?.url),
        totalDurationMs: Date.now() - startedAt,
      });
      return res.json({
        success: true,
        shopify_file_id: uploadedFile.id,
        url: uploadedFile.preview?.image?.url || null,
        filename: uploadedFile.alt,
        created_at: uploadedFile.createdAt,
      });
    } catch (err) {
      logger.error('[Shopify upload] failed', {
        requestId,
        error: err.message,
        status: err.response?.status,
        response: err.response?.data,
        totalDurationMs: Date.now() - startedAt,
      });
      return res.status(500).json({ success: false, message: 'Failed to upload file to Shopify', error: err.message });
    }
  });

  return router;
}

module.exports = { buildShopifyRouter };
