const crypto = require('crypto');
const bcrypt = require('bcrypt');

/**
 * API Key Service — generate, hash, validate, and manage API keys
 * Provides reusable methods for API key authentication
 * 
 * NOTE: Assumes api_keys table exists with columns:
 * id, key_hash (bcrypt), sha256_hash (for fast lookup), name, brand_key, 
 * permissions, created_at, last_used_at, expires_at, is_active, revoked_at, created_by_email
 */

class ApiKeyService {
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.ApiKey = sequelize.models.api_keys;
  }

  /**
   * Generate a random API key (32 chars) with prefix
   * Format: sk_prod_xxxxx (production) or sk_test_xxxxx (test)
   */
  generateKey(prefix = 'sk_prod') {
    const randomPart = crypto.randomBytes(24).toString('hex');
    return `${prefix}_${randomPart}`;
  }

  /**
   * Generate SHA256 hash of the key (for fast lookups)
   */
  generateSha256Hash(plainKey) {
    return crypto.createHash('sha256').update(plainKey).digest('hex');
  }

  /**
   * Hash a plain API key using bcrypt (for security)
   */
  async hashKey(plainKey) {
    return bcrypt.hash(plainKey, 10);
  }

  /**
   * Compare a plain key against a stored bcrypt hash
   */
  async compareKey(plainKey, hash) {
    return bcrypt.compare(plainKey, hash);
  }

  /**
   * Create a new API key in the database
   * Returns { plainKey, apiKey } where plainKey is the only time it's returned
   */
  async createApiKey(brandKey, name = '', permissions = [], createdByEmail = '') {
    const plainKey = this.generateKey();
    const keyHash = await this.hashKey(plainKey);
    const sha256Hash = this.generateSha256Hash(plainKey);
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1); // 1 year from now

    try {
      const apiKey = await this.ApiKey.create({
        key_hash: keyHash,
        sha256_hash: sha256Hash,
        name,
        brand_key: brandKey,
        permissions: Array.isArray(permissions) ? permissions : JSON.stringify(permissions),
        expires_at: expiresAt,
        is_active: true,
        created_by_email: createdByEmail,
      });

      return {
        success: true,
        plainKey, // Return once, user must save
        apiKey: apiKey.toJSON(),
      };
    } catch (err) {
      return {
        success: false,
        message: 'Failed to create API key',
        error: err.message,
      };
    }
  }

  /**
   * Validate an incoming API key (fast O(1) lookup using SHA256)
   * Returns { valid, apiKey, message }
   */
  async validateKey(plainKey, brandKey, requiredPermissions = []) {
    try {
      const sha256Hash = this.generateSha256Hash(plainKey);

      // Fast lookup: query by SHA256 hash (indexed)
      const apiKey = await this.ApiKey.findOne({
        where: {
          sha256_hash: sha256Hash,
          brand_key: brandKey,
          is_active: true,
          revoked_at: null,
        },
      });

      if (!apiKey) {
        return { valid: false, message: 'Invalid API key' };
      }

      // Check expiry
      if (apiKey.expires_at && new Date() > new Date(apiKey.expires_at)) {
        return { valid: false, message: 'API key expired' };
      }

      // Double-check: compare against bcrypt hash for security
      const isMatch = await this.compareKey(plainKey, apiKey.key_hash);
      if (!isMatch) {
        return { valid: false, message: 'Invalid API key' };
      }

      // Check permissions
      const keyPermissions = Array.isArray(apiKey.permissions)
        ? apiKey.permissions
        : JSON.parse(apiKey.permissions || '[]');
      const hasAllPermissions = requiredPermissions.every((perm) => keyPermissions.includes(perm));
      if (!hasAllPermissions) {
        return { valid: false, message: 'Insufficient permissions' };
      }

      // Update last_used_at
      await apiKey.update({ last_used_at: new Date() });

      return { valid: true, apiKey: apiKey.toJSON() };
    } catch (err) {
      console.error('Error validating API key:', err);
      return { valid: false, message: 'Validation error', error: err.message };
    }
  }

  /**
   * Revoke an API key by ID
   */
  async revokeKey(keyId) {
    try {
      const apiKey = await this.ApiKey.findByPk(keyId);
      if (!apiKey) return { success: false, message: 'API key not found' };

      await apiKey.update({ is_active: false, revoked_at: new Date() });
      return { success: true, message: 'API key revoked' };
    } catch (err) {
      return { success: false, message: 'Failed to revoke API key', error: err.message };
    }
  }

  /**
   * Rotate an API key: revoke old, create new with same permissions
   */
  async rotateKey(oldKeyId, createdByEmail = '') {
    try {
      const oldKey = await this.ApiKey.findByPk(oldKeyId);
      if (!oldKey) return { success: false, message: 'API key not found' };

      // Revoke old key
      await oldKey.update({ is_active: false, revoked_at: new Date() });

      // Create new key with same permissions
      const permissions = Array.isArray(oldKey.permissions)
        ? oldKey.permissions
        : JSON.parse(oldKey.permissions || '[]');
      const result = await this.createApiKey(oldKey.brand_key, oldKey.name, permissions, createdByEmail);

      return result;
    } catch (err) {
      return { success: false, message: 'Failed to rotate API key', error: err.message };
    }
  }

  /**
   * List all API keys for a brand
   */
  async listKeysByBrand(brandKey) {
    try {
      const keys = await this.ApiKey.findAll({
        where: { brand_key: brandKey },
        attributes: { exclude: ['key_hash', 'sha256_hash'] }, // Don't return hashes
        order: [['created_at', 'DESC']],
      });

      return { success: true, keys };
    } catch (err) {
      return { success: false, message: 'Failed to list API keys', error: err.message };
    }
  }
}

module.exports = ApiKeyService;
