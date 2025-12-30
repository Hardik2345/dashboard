const AuthService = require('../services/auth.service');

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    path: '/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000
};

exports.login = async (req, res) => {
    try {

        const { email, password } = req.body;
        const result = await AuthService.login(email, password, req.headers['user-agent']);

        res.cookie('refresh_token', result.refreshToken, COOKIE_OPTIONS);
        res.json({ access_token: result.accessToken });
    } catch (err) {
        console.error('Login error:', err.message);
        if (err.message === 'Invalid credentials') return res.status(401).json({ error: 'Invalid credentials' });
        if (err.message === 'User suspended') return res.status(403).json({ error: 'User suspended' });
        if (err.message === 'No active brand memberships') return res.status(403).json({ error: 'No active brand memberships' });
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

exports.refresh = async (req, res) => {
    try {
        const refreshToken = req.cookies.refresh_token;
        if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });

        const result = await AuthService.refresh(refreshToken);

        res.cookie('refresh_token', result.refreshToken, COOKIE_OPTIONS);
        res.json({ access_token: result.accessToken });
    } catch (err) {
        console.error('Refresh error:', err.message);
        // "Revoked token -> 401", "Expired token -> 401", "User suspended -> 403"
        if (err.message === 'Token reuse detected' || err.message === 'Token reused - Security Alert') return res.status(401).json({ error: 'Token revoked' });
        if (err.message === 'Invalid token' || err.message === 'Token expired') return res.status(401).json({ error: 'Token invalid or expired' });
        if (err.message === 'User suspended' || err.message === 'Membership suspended') return res.status(403).json({ error: 'User access denied' });

        res.status(401).json({ error: 'Unauthorized' }); // Fallback
    }
};

exports.logout = async (req, res) => {
    try {
        const refreshToken = req.cookies.refresh_token;
        if (refreshToken) {
            await AuthService.logout(refreshToken);
        }
        res.clearCookie('refresh_token', { ...COOKIE_OPTIONS, maxAge: 0 });
        res.status(200).json({ message: 'Logged out' });
    } catch (err) {
        res.status(500).json({ error: 'Logout failed' });
    }
};

exports.logoutAllSelf = async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Access token required' });

        const decoded = require('../services/token.service').verifyAccessToken(token);
        await AuthService.revokeAllRefreshTokensForUser(decoded.sub);

        res.clearCookie('refresh_token', { ...COOKIE_OPTIONS, maxAge: 0 });
        res.status(200).json({ message: 'Logged out from all devices' });

    } catch (err) {
        res.status(401).json({ error: 'Unauthorized' });
    }
};
