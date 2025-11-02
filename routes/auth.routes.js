const express = require('express');

// Factory to create the auth router.
// deps: { controllers: { AuthController } }
function createAuthRouter(deps = {}) {
  const router = express.Router();
  const { controllers = {} } = deps;
  const { AuthController } = controllers;

  // Only wire GET /auth/me for now to avoid conflicts with existing login/logout
  if (!AuthController || typeof AuthController.me !== 'function') {
    router.get('/me', (_req, res) => res.status(500).json({ error: 'AuthController.me not available' }));
  } else {
    router.get('/me', (req, res) => AuthController.me(req, res));
  }

  return router;
}

module.exports = { createAuthRouter };
