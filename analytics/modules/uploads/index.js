const express = require('express');
const multer = require('multer');
const AWS = require('aws-sdk');
const crypto = require('crypto');
const logger = require('../../shared/utils/logger');

const upload = multer({ storage: multer.memoryStorage() });

function buildUploadsRouter() {
  const router = express.Router();

  AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET,
    region: process.env.AWS_REGION || 'ap-south-1',
  });

  const s3 = new AWS.S3();
  const bucketName = process.env.AWS_S3_BUCKET || 'your-bucket-name';

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
        ContentType: file.mimetype,
      };

      await s3.upload(params).promise();

      const url = `https://${bucketName}.s3.amazonaws.com/${key}`;
      return res.json({ success: true, url });
    } catch (err) {
      logger.error('S3 upload error:', err);
      return res.status(500).json({ success: false, message: 'Upload failed', error: err.message });
    }
  });

  router.get('/uploads', async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));

      let allFiles = [];
      let continuationToken;
      let hasMore = true;

      while (hasMore) {
        const params = {
          Bucket: bucketName,
          MaxKeys: 1000,
          ContinuationToken: continuationToken,
        };

        const data = await s3.listObjectsV2(params).promise();
        if (data.Contents) {
          allFiles = allFiles.concat(
            data.Contents.map((obj) => ({
              key: obj.Key,
              url: `https://${bucketName}.s3.ap-south-1.amazonaws.com/${obj.Key}`,
              size: obj.Size,
              last_modified: obj.LastModified,
            })),
          );
        }

        hasMore = Boolean(data.IsTruncated);
        continuationToken = data.NextContinuationToken;
      }

      allFiles.sort((left, right) => new Date(right.last_modified) - new Date(left.last_modified));

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
          total_pages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      logger.error('S3 list error:', err);
      return res.status(500).json({ success: false, message: 'Failed to list files', error: err.message });
    }
  });

  return router;
}

module.exports = { buildUploadsRouter };
