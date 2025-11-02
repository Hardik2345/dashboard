// Central export of route factories. Phase 2 will inject real controllers and middleware.
const { createAuthRouter } = require('./auth.routes');
const { createAuthorRouter } = require('./author.routes');
const { createMetricsRouter } = require('./metrics.routes');
const { createTrendRouter } = require('./trend.routes');
const { createExternalRouter } = require('./external.routes');

module.exports = {
  createAuthRouter,
  createAuthorRouter,
  createMetricsRouter,
  createTrendRouter,
  createExternalRouter,
};
