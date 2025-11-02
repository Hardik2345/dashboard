const express = require('express');

// Factory to create the auth router.
// deps: { controllers: { AuthController } }
function createAuthRouter(deps = {}) {
  const router = express.Router();
  const { controllers = {} } = deps;
  const { AuthController } = controllers;

  // POST /auth/login
  if (AuthController && typeof AuthController.login === 'function') {
    router.post('/login', (req, res, next) => AuthController.login(req, res, next));
  }

  // POST /auth/logout
  if (AuthController && typeof AuthController.logout === 'function') {
    router.post('/logout', (req, res) => AuthController.logout(req, res));
  }

  // Only wire GET /auth/me for now to avoid conflicts with existing login/logout
  if (!AuthController || typeof AuthController.me !== 'function') {
    router.get('/me', (_req, res) => res.status(500).json({ error: 'AuthController.me not available' }));
  } else {
    router.get('/me', (req, res) => AuthController.me(req, res));
  }

  return router;
}

module.exports = { createAuthRouter };
