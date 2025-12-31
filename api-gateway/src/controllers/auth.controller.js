const AuthService = require('../services/auth.service');
const logger = require('../utils/logger');

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    path: '/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000
};

exports.login = async (req, res) => {
    try {
        const { email } = req.body;
        logger.info('AuthController', 'Login request received', { email, ip: req.ip });

        const result = await AuthService.login(req.body.email, req.body.password, req.headers['user-agent']);

        res.cookie('refresh_token', result.refreshToken, COOKIE_OPTIONS);
        logger.info('AuthController', 'Login response sent', { email });
        res.json({
            access_token: result.accessToken,
            user: result.user
        });
    } catch (err) {
        logger.error('AuthController', 'Login error', { error: err.message });
        if (err.message === 'Invalid credentials') return res.status(401).json({ error: 'Invalid credentials' });
        if (err.message === 'User suspended') return res.status(403).json({ error: 'User suspended' });
        if (err.message === 'No active brand memberships') return res.status(403).json({ error: 'No active brand memberships' });
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.refresh = async (req, res) => {
    try {
        logger.info('AuthController', 'Refresh request received', { ip: req.ip });
        const refreshToken = req.cookies.refresh_token;
        if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });

        const result = await AuthService.refresh(refreshToken);

        res.cookie('refresh_token', result.refreshToken, COOKIE_OPTIONS);
        logger.info('AuthController', 'Refresh success');
        res.json({ access_token: result.accessToken });
    } catch (err) {
        logger.error('AuthController', 'Refresh error', { error: err.message });
        // "Revoked token -> 401", "Expired token -> 401", "User suspended -> 403"
        if (err.message === 'Token reuse detected' || err.message === 'Token reused - Security Alert') return res.status(401).json({ error: 'Token revoked' });
        if (err.message === 'Invalid token' || err.message === 'Token expired') return res.status(401).json({ error: 'Token invalid or expired' });
        if (err.message === 'User suspended' || err.message === 'Membership suspended') return res.status(403).json({ error: 'User access denied' });

        res.status(401).json({ error: 'Unauthorized' }); // Fallback
    }
};

exports.logout = async (req, res) => {
    try {
        logger.info('AuthController', 'Logout request received');
        const refreshToken = req.cookies.refresh_token;
        if (refreshToken) {
            await AuthService.logout(refreshToken);
        }
        res.clearCookie('refresh_token', { ...COOKIE_OPTIONS, maxAge: 0 });
        logger.info('AuthController', 'Logout success');
        res.status(200).json({ message: 'Logged out' });
    } catch (err) {
        logger.error('AuthController', 'Logout error', { error: err.message });
        res.status(500).json({ error: 'Logout failed' });
    }
};

exports.logoutAllSelf = async (req, res) => {
    try {
        logger.info('AuthController', 'Logout All Self request received');
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Access token required' });

        const decoded = require('../services/token.service').verifyAccessToken(token);
        logger.info('AuthController', 'Logout All Self for user', { userId: decoded.sub });
        await AuthService.revokeAllRefreshTokensForUser(decoded.sub);

        res.clearCookie('refresh_token', { ...COOKIE_OPTIONS, maxAge: 0 });
        logger.info('AuthController', 'Logout All Self success');
        res.status(200).json({ message: 'Logged out from all devices' });

    } catch (err) {
        logger.error('AuthController', 'Logout All Self error', { error: err.message });
        res.status(401).json({ error: 'Unauthorized' });
    }
};