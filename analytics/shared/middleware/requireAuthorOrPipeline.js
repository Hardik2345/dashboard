const { requireTrustedAuthor } = require('./identityEdge');

function requireAuthorOrPipeline(req, res, next) {
  const pipelineKey = req.headers['x-pipeline-key'];
  const expectedKey = process.env.PIPELINE_AUTH_HEADER;
  const backupKey = process.env.X_PIPELINE_KEY;
  const isValid =
    (expectedKey && pipelineKey === expectedKey) ||
    (backupKey && pipelineKey === backupKey);

  if (pipelineKey && isValid) {
    req.user = { id: 'pipeline-service', role: 'admin', isAuthor: true };
    req.isAuthenticated = () => true;
    return next();
  }

  return requireTrustedAuthor(req, res, next);
}

module.exports = { requireAuthorOrPipeline };
