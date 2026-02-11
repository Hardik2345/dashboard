const GlobalUser = require('../models/GlobalUser.model');
const RefreshToken = require('../models/RefreshToken.model');
const TokenService = require('./token.service');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const DomainRule = require('../models/DomainRule.model');

const REFRESH_TOKEN_EXPIRY_DAYS = process.env.REFRESH_TOKEN_EXPIRY_DAYS || 7;

class AuthService {
    static async issueTokensForUser(user, deviceId = null) {
        const accessToken = TokenService.generateAccessToken(user);
        const { tokenId, rawToken, tokenHash } = TokenService.generateRefreshToken();

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + parseInt(REFRESH_TOKEN_EXPIRY_DAYS));

        const refreshTokenDoc = new RefreshToken({
            _id: tokenId,
            user_id: user._id,
            device_id: deviceId,
            token_hash: tokenHash,
            expires_at: expiresAt,
            revoked: false
        });

        await refreshTokenDoc.save();

        return { accessToken, refreshToken: rawToken };
    }

    static async signup({ email, password, primaryBrandId, role = 'author' }) {
        if (!email || !password || !primaryBrandId) {
            throw new Error('Missing required fields');
        }

        const existing = await GlobalUser.findOne({ email });
        if (existing) {
            throw new Error('User already exists');
        }

        const password_hash = await bcrypt.hash(password, 10);
        const brandMembership = {
            brand_id: primaryBrandId,
            status: 'active',
            permissions: ['all']
        };

        const user = await GlobalUser.create({
            email,
            password_hash,
            status: 'active',
            role: role || 'viewer',
            primary_brand_id: primaryBrandId,
            brand_memberships: [brandMembership],
        });

        const accessToken = TokenService.generateAccessToken(user, primaryBrandId);
        const { tokenId, rawToken, tokenHash } = TokenService.generateRefreshToken();

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + parseInt(REFRESH_TOKEN_EXPIRY_DAYS));

        const refreshTokenDoc = new RefreshToken({
            _id: tokenId,
            user_id: user._id,
            device_id: null,
            token_hash: tokenHash,
            expires_at: expiresAt,
            revoked: false
        });

        await refreshTokenDoc.save();

        return {
            accessToken,
            refreshToken: rawToken,
            user,
        };
    }

    static normalizeBrands(brand_ids = [], primary_brand_id = null, role = 'viewer') {
        const brandIds = Array.isArray(brand_ids) ? [...new Set(brand_ids.map(b => (b || '').toUpperCase()).filter(Boolean))] : [];
        const primary = primary_brand_id ? primary_brand_id.toUpperCase() : null;
        if (!primary) throw new Error('primary_brand_id required');
        if (!brandIds.includes(primary)) brandIds.push(primary);
        if (role === 'author' && brandIds.length === 0) brandIds.push(primary);
        return { brandIds, primary };
    }

    static async provisionUserFromRule(email, rule) {
        const normalizedEmail = (email || '').toLowerCase();
        const role = rule.role || 'viewer';
        const { brandIds, primary } = this.normalizeBrands(rule.brand_ids, rule.primary_brand_id, role);
        const perms = role === 'author' ? ['all'] : (rule.permissions && rule.permissions.length ? rule.permissions : ['all']);
        const memberships = brandIds.map((bid) => ({
            brand_id: bid,
            status: 'active',
            permissions: perms
        }));

        // Upsert atomically to avoid race duplicates
        const password_hash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
        const user = await GlobalUser.findOneAndUpdate(
            { email: normalizedEmail },
            {
                $setOnInsert: {
                    password_hash
                },
                $set: {
                    role,
                    primary_brand_id: primary,
                    brand_memberships: memberships,
                    status: rule.status || 'active',
                },
            },
            { upsert: true, new: true }
        );
        return user;
    }

    static async provisionUserByDomainRule(email) {
        const normalizedEmail = (email || '').toLowerCase();
        const domain = normalizedEmail.split('@')[1];
        if (!domain) return null;
        const rule = await DomainRule.findOne({ domain, status: 'active' }).lean();
        if (!rule) return null;
        return this.provisionUserFromRule(email, rule);
    }

    /**
     * Authenticate user and issue tokens
     * @param {String} email 
     * @param {String} password 
     * @param {String} userAgent 
     * @param {String} ipAddress 
     */
    static async login(email, password, userAgent) {
        // 1. Find User
        let user = await GlobalUser.findOne({ email });
        if (!user) {
            const provisioned = await this.provisionUserByDomainRule(email);
            if (!provisioned) throw new Error('Invalid credentials');
            user = provisioned;
        }

        // 2. Verify Password
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            throw new Error('Invalid credentials');
        }

        // 3. User & Membership Status Check
        if (user.status !== 'active') {
            throw new Error('User suspended');
        }
        const hasActiveBrand = user.role === 'author' || user.brand_memberships.some(m => m.status === 'active');
        if (!hasActiveBrand) {
            throw new Error('No active brand memberships');
        }

        // 4. Generate Tokens
        const accessToken = TokenService.generateAccessToken(user);
        const { tokenId, rawToken, tokenHash } = TokenService.generateRefreshToken();

        // 5. Persist Refresh Token
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + parseInt(REFRESH_TOKEN_EXPIRY_DAYS));

        const refreshTokenDoc = new RefreshToken({
            _id: tokenId,
            user_id: user._id,
            device_id: userAgent, // identifying info or null
            token_hash: tokenHash,
            expires_at: expiresAt,
            revoked: false
        });

        await refreshTokenDoc.save();

        return {
            accessToken,
            refreshToken: rawToken, // Send raw token to controller to set cookie
            user,
        };
    }

    /**
     * Google OAuth login (requires pre-created user)
     * @param {Object} profile { email, name, sub }
     */
    static async loginWithGoogle(profile) {
        const email = (profile.email || '').toLowerCase();
        if (!email) throw new Error('Email required');

        let user = await GlobalUser.findOne({ email });
        if (!user) {
            const provisioned = await this.provisionUserByDomainRule(email);
            if (!provisioned) throw new Error('User not allowed');
            user = provisioned;
        }

        if (user.status !== 'active') throw new Error('User suspended');
        const hasActiveBrand = user.role === 'author' || (user.brand_memberships && user.brand_memberships.some(m => m.status === 'active'));
        if (!hasActiveBrand) throw new Error('No active brand memberships');

        try {
            const tokens = await this.issueTokensForUser(user, 'google-oauth');
            return { ...tokens, user };
        } catch (err) {
            console.error('AuthService.loginWithGoogle issueTokens error', { error: err.message, stack: err.stack });
            throw err;
        }
    }

    /**
     * Rotate refresh token and issue new access token
     * @param {String} rawRefreshToken 
     */
    static async refresh(rawRefreshToken) {
        if (!rawRefreshToken) {
            throw new Error('Token required');
        }
        const inputHash = require('crypto').createHash('sha256').update(rawRefreshToken).digest('hex');

        const tokenDoc = await RefreshToken.findOne({ token_hash: inputHash });

        // 2. Edge Case: Token reused (Revoked token used)
        if (tokenDoc && tokenDoc.revoked) {
            const logger = require('../utils/logger');

            // --- GRACE PERIOD LOGIC ---
            const REFRESH_GRACE_PERIOD_MS = 30 * 1000; // 30 seconds
            const now = new Date();
            const revokedAt = tokenDoc.revoked_at || new Date(0);

            if (now - revokedAt < REFRESH_GRACE_PERIOD_MS) {
                logger.info('AuthService', 'Token rotation grace period hit - Returning existing child tokens', {
                    tokenId: tokenDoc._id,
                    userId: tokenDoc.user_id
                });

                // Find the token that was rotated from this one
                const childTokenDoc = await RefreshToken.findOne({ rotated_from: tokenDoc._id });
                if (childTokenDoc) {
                    // We can't easily get the RAW token of the child since it's hashed in DB,
                    // BUT in a concurrent race, both tabs usually have the SAME old token.
                    // If we allow the refresh to proceed and issue NEW tokens again, 
                    // we just need to make sure we don't trigger the "token reuse" alert.
                    // Instead of failing, we'll allow this specific "old" token to rotate ONE more time
                    // IF it hasn't been too long.
                    logger.info('AuthService', 'Allowing grace period rotation', { tokenId: tokenDoc._id });
                } else {
                    // If no child found (rare race), let it proceed to rotation below
                }
            } else {
                logger.warn('AuthService', 'Token reuse detected - Triggering chain revocation', {
                    tokenId: tokenDoc._id,
                    userId: tokenDoc.user_id,
                    revokedAt: tokenDoc.revoked_at
                });
                await this.revokeChain(tokenDoc._id);
                throw new Error('Token reused - Security Alert');
            }
        }

        // 3. Validation
        if (!tokenDoc) {
            const logger = require('../utils/logger');
            logger.warn('AuthService', 'Refresh failed - Token not found in DB', { inputHash });
            throw new Error('Invalid token');
        }
        if (new Date() > tokenDoc.expires_at) {
            const logger = require('../utils/logger');
            logger.warn('AuthService', 'Refresh failed - Token expired', {
                tokenId: tokenDoc._id,
                expiresAt: tokenDoc.expires_at
            });
            throw new Error('Token expired');
        }

        // 4. Get User
        const user = await GlobalUser.findById(tokenDoc.user_id);
        if (!user || user.status !== 'active') {
            throw new Error('User suspended or not found');
        }
        // Check membership suspension again
        const hasActiveBrand = user.role === 'author' || (user.brand_memberships && user.brand_memberships.some(m => m.status === 'active'));
        if (!user.brand_memberships || !hasActiveBrand) {
            throw new Error('Membership suspended');
        }

        // 5. Rotate
        // Revoke old
        tokenDoc.revoked = true;
        tokenDoc.revoked_at = new Date(); // SET REVOKED AT
        await tokenDoc.save();

        // Issue new
        const { tokenId, rawToken, tokenHash } = TokenService.generateRefreshToken();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + parseInt(REFRESH_TOKEN_EXPIRY_DAYS));

        const newRefreshToken = new RefreshToken({
            _id: tokenId,
            user_id: user._id,
            device_id: tokenDoc.device_id,
            token_hash: tokenHash,
            expires_at: expiresAt,
            rotated_from: tokenDoc._id
        });

        await newRefreshToken.save();

        const logger = require('../utils/logger');
        logger.info('AuthService', 'Token rotated successfully', {
            oldTokenId: tokenDoc._id,
            newTokenId: tokenId,
            userId: user._id
        });

        const accessToken = TokenService.generateAccessToken(user);

        return {
            accessToken,
            refreshToken: rawToken
        };
    }

    static async revokeChain(ancestorId) {
        // Find the token that claims to be rotated from this ancestor
        const child = await RefreshToken.findOne({ rotated_from: ancestorId });
        if (child) {
            const logger = require('../utils/logger');
            logger.warn('AuthService', 'Revoking child token in chain', {
                tokenId: child._id,
                userId: child.user_id
            });
            child.revoked = true;
            await child.save();
            // Recurse
            await this.revokeChain(child._id);
        }
    }

    static async logout(rawRefreshToken) {
        const inputHash = require('crypto').createHash('sha256').update(rawRefreshToken).digest('hex');
        const tokenDoc = await RefreshToken.findOne({ token_hash: inputHash });
        if (tokenDoc) {
            const logger = require('../utils/logger');
            logger.info('AuthService', 'Explicit logout - Revoking token', {
                tokenId: tokenDoc._id,
                userId: tokenDoc.user_id
            });
            tokenDoc.revoked = true;
            await tokenDoc.save();
        }
    }

    static async revokeAllRefreshTokensForUser(userId) {
        const logger = require('../utils/logger');
        const result = await RefreshToken.updateMany({ user_id: userId }, { revoked: true });
        logger.warn('AuthService', 'Revoked all tokens for user', {
            userId,
            modifiedCount: result.modifiedCount
        });
    }
}


module.exports = AuthService;
