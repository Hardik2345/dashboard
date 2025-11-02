const express = require('express');

// Factory to create the author router.
// deps: { requireAuth, controllers: { AuthorController } }
function createAuthorRouter(deps = {}) {
  const router = express.Router();
  const { requireAuth, controllers = {} } = deps;
  const { AuthorController } = controllers;

  // Only wire GET /author/me for now; keep /author/brands in server.js
  if (!AuthorController || typeof AuthorController.me !== 'function') {
    router.get('/me', (_req, res) => res.status(500).json({ error: 'AuthorController.me not available' }));
  } else if (typeof requireAuth === 'function') {
    router.get('/me', requireAuth, (req, res) => AuthorController.me(req, res));
  } else {
    router.get('/me', (req, res) => AuthorController.me(req, res));
  }

  // Wire /author/brands GET and POST here to migrate from server.js
  if (AuthorController && typeof AuthorController.listBrands === 'function') {
    if (typeof requireAuth === 'function') {
      router.get('/brands', requireAuth, (req, res) => AuthorController.listBrands(req, res));
    } else {
      router.get('/brands', (req, res) => AuthorController.listBrands(req, res));
    }
  }
  if (AuthorController && typeof AuthorController.createBrand === 'function') {
    if (typeof requireAuth === 'function') {
      router.post('/brands', requireAuth, (req, res) => AuthorController.createBrand(req, res));
    } else {
      router.post('/brands', (req, res) => AuthorController.createBrand(req, res));
    }
  }

  return router;
}

module.exports = { createAuthorRouter };
