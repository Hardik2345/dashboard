const GlobalUser = require('../models/GlobalUser.model');
const RefreshToken = require('../models/RefreshToken.model');
const TokenService = require('./token.service');
const bcrypt = require('bcryptjs');

const REFRESH_TOKEN_EXPIRY_DAYS = process.env.REFRESH_TOKEN_EXPIRY_DAYS || 7;

class AuthService {
    /**
     * Authenticate user and issue tokens
     * @param {String} email 
     * @param {String} password 
     * @param {String} userAgent 
     * @param {String} ipAddress 
     */
    static async login(email, password, userAgent) {
        // 1. Find User
        const user = await GlobalUser.findOne({ email });
        if (!user) {
            throw new Error('Invalid credentials');
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
        const hasActiveBrand = user.brand_memberships.some(m => m.status === 'active');
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
            refreshToken: rawToken // Send raw token to controller to set cookie
        };
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
            await this.revokeChain(tokenDoc._id);
            throw new Error('Token reused - Security Alert');
        }

        // 3. Validation
        if (!tokenDoc) {
            throw new Error('Invalid token');
        }
        if (new Date() > tokenDoc.expires_at) {
            throw new Error('Token expired');
        }

        // 4. Get User
        const user = await GlobalUser.findById(tokenDoc.user_id);
        if (!user || user.status !== 'active') {
            throw new Error('User suspended or not found');
        }
        // Check membership suspension again
        const hasActiveBrand = user.brand_memberships.some(m => m.status === 'active');
        if (!user.brand_memberships || !hasActiveBrand) {
            throw new Error('Membership suspended');
        }

        // 5. Rotate
        // Revoke old
        tokenDoc.revoked = true;
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
            tokenDoc.revoked = true;
            await tokenDoc.save();
        }
    }

    static async revokeAllRefreshTokensForUser(userId) {
        await RefreshToken.updateMany({ user_id: userId }, { revoked: true });
    }
}


module.exports = AuthService;
