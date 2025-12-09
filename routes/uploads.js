const express = require('express');
const multer = require('multer');
const AWS = require('aws-sdk');
const crypto = require('crypto');

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
      console.error('S3 upload error:', err);
      res.status(500).json({ success: false, message: 'Upload failed', error: err.message });
    }
  });

  return router;
}

module.exports = { buildUploadsRouter };
