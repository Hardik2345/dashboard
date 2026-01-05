const express = require('express');
const { login, logout, googleDebug, googleCallback, me } = require('../controllers/authController');
const { requireAuth } = require('../middlewares/auth');

function buildAuthRouter({ passport, accessCache }) {
  const router = express.Router();

  router.post('/login', login(passport));
  router.post('/logout', logout());

  // Google OAuth routes (conditionally registered based on env)
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const successRedirect = process.env.LOGIN_SUCCESS_REDIRECT || '/';
    const failureRedirect = process.env.LOGIN_FAILURE_REDIRECT || '/login?error=google_oauth_failed';

    router.get('/google/debug', googleDebug(successRedirect, failureRedirect, accessCache));
    router.get('/google', passport.authenticate('google', { scope: ['profile','email'] }));
    router.get('/google/callback', googleCallback(passport, successRedirect, failureRedirect));
  }

  router.get('/me', requireAuth, me());
  return router;
}

module.exports = { buildAuthRouter };
