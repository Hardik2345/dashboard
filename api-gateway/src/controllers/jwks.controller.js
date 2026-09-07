const TokenService = require('../services/token.service');

exports.getJwks = (req, res) => {
    try {
        const jwks = TokenService.getJWKS();
        res.setHeader('Content-Type', 'application/json');
        // Cache header: keys don't change often. 1 hour cache?
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.json(jwks);
    } catch (err) {
        console.error('JWKS Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
