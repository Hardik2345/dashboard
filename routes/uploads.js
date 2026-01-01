const express = require('express');
const multer = require('multer');
const AWS = require('aws-sdk');
const crypto = require('crypto');
const logger = require('../utils/logger');

const upload = multer({ storage: multer.memoryStorage() });

function buildUploadsRouter() {
  const router = express.Router();

  // Configure AWS S3
  AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET,
    region: process.env.AWS_REGION || 'ap-south-1'
  });

  const s3 = new AWS.S3();
  const bucketName = process.env.AWS_S3_BUCKET || 'your-bucket-name';

  /**
   * POST /upload
   * Uploads a single image file to S3 and returns the public URL.
   * 
   * Query/Body:
   *   - image (multipart/form-data) - the file to upload
   * 
   * Response:
   *   { success: true, url: "https://bucket.s3.amazonaws.com/key" }
   *   or
   *   { success: false, message: "error message" }
   */
  router.post('/upload', upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file provided' });
      }

      const file = req.file;
      const key = crypto.randomUUID() + '-' + file.originalname;

      const params = {
        Bucket: bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype
      };

      await s3.upload(params).promise();

      const url = `https://${bucketName}.s3.amazonaws.com/${key}`;

      return res.json({ success: true, url });
    } catch (err) {
      logger.error('S3 upload error:', err);
      res.status(500).json({ success: false, message: 'Upload failed', error: err.message });
    }
  });

  /**
   * GET /uploads
   * List all uploaded files from S3 bucket with pagination.
   * 
   * Query params:
   *   - page (optional, default=1) - page number
   *   - limit (optional, default=20) - items per page
   * 
   * Response:
   *   {
   *     success: true,
   *     files: [
   *       { key, url, size, last_modified },
   *       ...
   *     ],
   *     pagination: { page, limit, total, total_pages }
   *   }
   */
  router.get('/uploads', async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 20));

      let allFiles = [];
      let continuationToken = undefined;

      // Fetch all objects from bucket (paginate through S3 results)
      let hasMore = true;
      while (hasMore) {
        const params = {
          Bucket: bucketName,
          MaxKeys: 1000,
          ContinuationToken: continuationToken
        };

        const data = await s3.listObjectsV2(params).promise();

        if (data.Contents) {
          allFiles = allFiles.concat(
            data.Contents.map(obj => ({
              key: obj.Key,
              url: `https://${bucketName}.s3.ap-south-1.amazonaws.com/${obj.Key}`,
              size: obj.Size,
              last_modified: obj.LastModified
            }))
          );
        }

        hasMore = Boolean(data.IsTruncated);
        continuationToken = data.NextContinuationToken;
      }

      // Sort by most recent first
      allFiles.sort((a, b) => new Date(b.last_modified) - new Date(a.last_modified));

      // Paginate
      const total = allFiles.length;
      const start = (page - 1) * limit;
      const end = start + limit;
      const files = allFiles.slice(start, end);

      return res.json({
        success: true,
        files,
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit)
        }
      });
    } catch (err) {
      logger.error('S3 list error:', err);
      res.status(500).json({ success: false, message: 'Failed to list files', error: err.message });
    }
  });

  return router;
}

module.exports = { buildUploadsRouter };
