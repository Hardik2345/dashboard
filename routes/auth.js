const express = require('express');
const { login, logout, googleDebug, googleCallback, me } = require('../controllers/authController');

function buildAuthRouter({ passport, accessCache }) {
  const router = express.Router();

  router.post('/login', login(passport));
  router.post('/logout', logout());

  // Google OAuth routes (conditionally registered based on env)
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const successRedirect = process.env.LOGIN_SUCCESS_REDIRECT || '/';
    const failureRedirect = process.env.LOGIN_FAILURE_REDIRECT || '/login?error=google_oauth_failed';

    router.get('/google/debug', googleDebug(successRedirect, failureRedirect, accessCache));
    // Always start Google OAuth with a fresh session so stale cookies cannot break the flow
    router.get('/google', (req, res, next) => {
      const launch = () => passport.authenticate('google', { scope: ['profile','email'] })(req, res, next);
      if (!req.session || typeof req.session.regenerate !== 'function') return launch();
      req.session.regenerate((err) => {
        if (err) return next(err);
        launch();
      });
    });
    router.get('/google/callback', googleCallback(passport, successRedirect, failureRedirect));
  }

  router.get('/me', me());
  return router;
}

module.exports = { buildAuthRouter };
