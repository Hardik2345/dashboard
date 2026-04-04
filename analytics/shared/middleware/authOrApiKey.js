const { requireTrustedPrincipal } = require('./identityEdge');

function createAuthOrApiKeyMiddleware(apiKeyAuth) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      return apiKeyAuth(req, res, next);
    }
    return requireTrustedPrincipal(req, res, next);
  };
}

module.exports = { createAuthOrApiKeyMiddleware };
