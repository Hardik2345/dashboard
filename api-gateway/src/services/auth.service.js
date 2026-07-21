const GlobalUser = require('../models/GlobalUser.model');
const RefreshToken = require('../models/RefreshToken.model');
const TokenService = require('./token.service');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const DomainRule = require('../models/DomainRule.model');
const {
    fetchAllBrandIds,
    isElevatedRole,
    normalizeBrandIds,
    normalizePermissions,
    normalizePrimaryBrand,
    normalizeRole,
} = require('./rbac.service');

const REFRESH_TOKEN_EXPIRY_DAYS = process.env.REFRESH_TOKEN_EXPIRY_DAYS || 7;

// --- Rotation grace cache ---------------------------------------------------
// Maps a just-consumed refresh token_hash -> the raw child token it rotated to.
// A concurrent/benign double-refresh (e.g. two tabs presenting the same cookie)
// is served the SAME child instead of being treated as token reuse. Entries
// self-expire after ROTATION_GRACE_MS.
// NOTE: in-memory, so it only dedupes within a single auth-service instance.
// The atomic claim below is what guarantees correctness across instances; if you
// run >1 instance, back this cache with Redis so losers on another instance can
// still resolve the child token instead of getting a reuse error.
const recentRotations = new Map();

// Grace window length. Read dynamically so it can be tuned per environment
// (e.g. set REFRESH_ROTATION_GRACE_MS=0 to disable and get strict reuse detection).
function rotationGraceMs() {
    const raw = process.env.REFRESH_ROTATION_GRACE_MS;
    const n = raw !== undefined ? Number(raw) : 60 * 1000;
    return Number.isFinite(n) && n >= 0 ? n : 60 * 1000;
}

function rememberRotation(consumedHash, rawChild) {
    const ttl = rotationGraceMs();
    recentRotations.set(consumedHash, { rawChild, at: Date.now() });
    const timer = setTimeout(() => recentRotations.delete(consumedHash), ttl);
    if (timer.unref) timer.unref();
}

function getRecentRotation(consumedHash) {
    const entry = recentRotations.get(consumedHash);
    if (!entry) return null;
    if (Date.now() - entry.at >= rotationGraceMs()) {
        recentRotations.delete(consumedHash);
        return null;
    }
    return entry;
}

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

    static normalizeLegacyBrands(brand_ids = [], primary_brand_id = null, role = 'viewer') {
        const brandIds = normalizeBrandIds(brand_ids);
        const primary = normalizePrimaryBrand(primary_brand_id);
        if (!primary) throw new Error('primary_brand_id required');
        if (!brandIds.includes(primary)) brandIds.push(primary);
        if (role === 'author' && brandIds.length === 0) brandIds.push(primary);
        return { brandIds, primary };
    }

    static async buildProvisionedMemberships(role, brand_ids = [], primary_brand_id = null, permissions = ['all']) {
        const normalizedRole = normalizeRole(role);

        if (normalizedRole === 'super_admin') {
            const brandIds = await fetchAllBrandIds();
            return {
                role: normalizedRole,
                primary: brandIds[0],
                memberships: brandIds.map((brandId) => ({
                    brand_id: brandId,
                    status: 'active',
                    permissions: ['all']
                }))
            };
        }

        if (normalizedRole === 'brand_user') {
            const brandIds = normalizeBrandIds([...normalizeBrandIds(brand_ids), normalizePrimaryBrand(primary_brand_id)]);
            if (brandIds.length !== 1) throw new Error('brand_user requires exactly one brand');
            const safePermissions = normalizePermissions(permissions);
            return {
                role: normalizedRole,
                primary: brandIds[0],
                memberships: brandIds.map((brandId) => ({
                    brand_id: brandId,
                    status: 'active',
                    permissions: safePermissions
                }))
            };
        }

        const { brandIds, primary } = this.normalizeLegacyBrands(brand_ids, primary_brand_id, normalizedRole);
        const perms = normalizedRole === 'author' ? ['all'] : (permissions && permissions.length ? permissions : ['all']);
        return {
            role: normalizedRole,
            primary,
            memberships: brandIds.map((brandId) => ({
                brand_id: brandId,
                status: 'active',
                permissions: perms
            }))
        };
    }

    static async provisionUserFromRule(email, rule) {
        const normalizedEmail = (email || '').toLowerCase();
        const assignment = await this.buildProvisionedMemberships(
            rule.role || 'viewer',
            rule.brand_ids,
            rule.primary_brand_id,
            rule.permissions,
        );

        // Upsert atomically to avoid race duplicates
        const password_hash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
        const user = await GlobalUser.findOneAndUpdate(
            { email: normalizedEmail },
            {
                $setOnInsert: {
                    password_hash
                },
                $set: {
                    role: assignment.role,
                    primary_brand_id: assignment.primary,
                    brand_memberships: assignment.memberships,
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
        const hasActiveBrand = isElevatedRole(user.role) || user.brand_memberships.some(m => m.status === 'active');
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
        const hasActiveBrand = isElevatedRole(user.role) || (user.brand_memberships && user.brand_memberships.some(m => m.status === 'active'));
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
        const logger = require('../utils/logger');

        if (!rawRefreshToken) {
            throw new Error('Token required');
        }
        const inputHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

        const tokenDoc = await RefreshToken.findOne({ token_hash: inputHash });

        // 1. Validation
        if (!tokenDoc) {
            logger.warn('AuthService', 'Refresh failed - Token not found in DB', { inputHash });
            throw new Error('Invalid token');
        }
        if (new Date() > tokenDoc.expires_at) {
            logger.warn('AuthService', 'Refresh failed - Token expired', {
                tokenId: tokenDoc._id,
                expiresAt: tokenDoc.expires_at
            });
            throw new Error('Token expired');
        }

        // 2. Get User (also needed to re-mint the access token on a grace hit)
        const user = await GlobalUser.findById(tokenDoc.user_id);
        if (!user || user.status !== 'active') {
            throw new Error('User suspended or not found');
        }
        const hasActiveBrand = isElevatedRole(user.role) || (user.brand_memberships && user.brand_memberships.some(m => m.status === 'active'));
        if (!user.brand_memberships || !hasActiveBrand) {
            throw new Error('Membership suspended');
        }

        // 3. Atomic claim: flip revoked false->true exactly once. Only the winner
        // rotates; concurrent callers get `null` here and fall back to the grace
        // cache below. This eliminates duplicate children from the same parent.
        const claimed = await RefreshToken.findOneAndUpdate(
            { _id: tokenDoc._id, revoked: false },
            { $set: { revoked: true, revoked_at: new Date() } },
            { new: true }
        );

        if (!claimed) {
            // We lost the race (token already revoked). Benign concurrent refresh?
            const grace = getRecentRotation(inputHash);
            if (grace) {
                logger.info('AuthService', 'Rotation grace hit - returning existing child token', {
                    tokenId: tokenDoc._id,
                    userId: tokenDoc.user_id
                });
                return {
                    accessToken: TokenService.generateAccessToken(user),
                    refreshToken: grace.rawChild
                };
            }

            // Revoked, and NOT a rotation we just performed => genuine replay of an
            // old token. This is the real security signal.
            logger.warn('AuthService', 'Token reuse detected - Triggering chain revocation', {
                tokenId: tokenDoc._id,
                userId: tokenDoc.user_id,
                revokedAt: tokenDoc.revoked_at
            });
            require('../observability').recordAuthTokenReuse();
            await this.revokeChain(tokenDoc._id);
            throw new Error('Token reused - Security Alert');
        }

        // 4. We own the rotation. Issue exactly one child.
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

        // Remember this rotation so concurrent presenters of the same parent get
        // this exact child (idempotent) instead of a reuse error.
        rememberRotation(inputHash, rawToken);

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
        const logger = require('../utils/logger');
        // Follow ALL branches - a corrupted history may have multiple children
        // pointing at the same ancestor. findOne would miss the others.
        const children = await RefreshToken.find({ rotated_from: ancestorId });
        for (const child of children) {
            logger.warn('AuthService', 'Revoking child token in chain', {
                tokenId: child._id,
                userId: child.user_id
            });
            child.revoked = true;
            if (!child.revoked_at) child.revoked_at = new Date();
            await child.save();
            // Recurse
            await this.revokeChain(child._id);
        }
    }

    static async logout(rawRefreshToken) {
        const inputHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
        const tokenDoc = await RefreshToken.findOne({ token_hash: inputHash });
        if (tokenDoc) {
            const logger = require('../utils/logger');
            logger.info('AuthService', 'Explicit logout - Revoking token', {
                tokenId: tokenDoc._id,
                userId: tokenDoc.user_id
            });
            tokenDoc.revoked = true;
            tokenDoc.revoked_at = new Date();
            await tokenDoc.save();
        }
    }

    static async revokeAllRefreshTokensForUser(userId) {
        const logger = require('../utils/logger');
        const result = await RefreshToken.updateMany(
            { user_id: userId, revoked: false },
            { $set: { revoked: true, revoked_at: new Date() } }
        );
        logger.warn('AuthService', 'Revoked all tokens for user', {
            userId,
            modifiedCount: result.modifiedCount
        });
    }
}


module.exports = AuthService;
