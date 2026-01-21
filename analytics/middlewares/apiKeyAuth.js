/**
 * API Key Authentication Middleware with Rate Limiting
 * Validates API keys and enforces 100 requests/minute rate limit
 */

const rateLimitMap = new Map(); // In-memory rate limit tracker: keyId -> { windowStart, count }

function getMinuteWindow() {
  return Math.floor(Date.now() / 60000) * 60000; // Start of current minute
}

function checkRateLimit(apiKeyId, maxRequests = 100) {
  const windowStart = getMinuteWindow();

  if (!rateLimitMap.has(apiKeyId)) {
    rateLimitMap.set(apiKeyId, { windowStart, count: 0 });
  }

  const window = rateLimitMap.get(apiKeyId);

  // Reset if we've moved to a new minute window
  if (window.windowStart !== windowStart) {
    window.windowStart = windowStart;
    window.count = 0;
  }

  window.count++;

  if (window.count > maxRequests) {
    return { allowed: false, remaining: 0, resetAt: new Date(windowStart + 60000) };
  }

  return {
    allowed: true,
    remaining: maxRequests - window.count,
    resetAt: new Date(windowStart + 60000),
  };
}

/**
 * API Key Auth Middleware Factory
 * Returns middleware that validates API key and enforces rate limits
 * 
 * Usage: app.use('/protected', apiKeyAuth(sequelize, ['permission']))
 */
function createApiKeyAuthMiddleware(sequelize, requiredPermissions = []) {
  const ApiKeyService = require('../services/apiKeyService');
  const apiKeyService = new ApiKeyService(sequelize);

  return async (req, res, next) => {
    try {
      // Extract API key from Authorization header
      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          message: 'Missing or invalid Authorization header',
          error_code: 'MISSING_API_KEY',
        });
      }

      const plainKey = authHeader.substring(7); // Remove 'Bearer ' prefix
      const brandKey = req.query.brand_key || req.body.brand_key || '';

      if (!brandKey) {
        return res.status(400).json({
          success: false,
          message: 'brand_key is required',
          error_code: 'MISSING_BRAND_KEY',
        });
      }

      // Validate the API key (fast O(1) lookup)
      const validation = await apiKeyService.validateKey(plainKey, brandKey, requiredPermissions);

      if (!validation.valid) {
        return res.status(401).json({
          success: false,
          message: validation.message || 'Unauthorized',
          error_code: 'INVALID_API_KEY',
        });
      }

      // Check rate limit (100 requests per minute per key)
      const rateLimitResult = checkRateLimit(validation.apiKey.id, 100);

      res.setHeader('X-RateLimit-Limit', '100');
      res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining);
      res.setHeader('X-RateLimit-Reset', rateLimitResult.resetAt.toISOString());

      if (!rateLimitResult.allowed) {
        return res.status(429).json({
          success: false,
          message: 'Rate limit exceeded: 100 requests per minute',
          error_code: 'RATE_LIMIT_EXCEEDED',
          reset_at: rateLimitResult.resetAt,
        });
      }

      // Attach API key info to request
      req.apiKey = validation.apiKey;
      req.brandKey = brandKey;

      next();
    } catch (err) {
      console.error('API Key auth error:', err);
      res.status(500).json({
        success: false,
        message: 'Authentication error',
        error_code: 'AUTH_ERROR',
      });
    }
  };
}

module.exports = { createApiKeyAuthMiddleware, checkRateLimit };
