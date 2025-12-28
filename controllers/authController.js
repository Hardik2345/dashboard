// Auth-related controllers
function login(passport) {
  return (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ error: info?.message || 'Invalid credentials' });
      req.session.regenerate(err2 => {
        if (err2) return next(err2);
        req.login(user, err3 => {
          if (err3) return next(err3);
          return res.json({ user });
        });
      });
    })(req, res, next);
  };
}

function logout() {
  return (req, res) => {
    req.logout && req.logout(() => {});
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.status(204).end();
    });
  };
}

function googleDebug(successRedirect, failureRedirect, accessCache) {
  return (req, res) => {
    return res.json({
      clientID: process.env.GOOGLE_CLIENT_ID,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
      successRedirect,
      failureRedirect,
      nodeEnv: process.env.NODE_ENV,
      access: accessCache.data || null
    });
  };
}

function googleCallback(passport, successRedirect, failureRedirect) {
  return (req, res, next) => {
    passport.authenticate('google', (err, user, info) => {
      if (err) return next(err);
      if (!user) {
        const reason = encodeURIComponent(info?.reason || 'google_oauth_failed');
        const msg = encodeURIComponent(info?.message || 'Login failed');
        const sep = failureRedirect.includes('?') ? '&' : '?';
        return res.redirect(`${failureRedirect}${sep}reason=${reason}&msg=${msg}`);
      }
      req.login(user, (err2) => {
        if (err2) return next(err2);
        return res.redirect(successRedirect);
      });
    })(req, res, next);
  };
}

function me() {
  return (req, res) => {
    if (req.isAuthenticated && req.isAuthenticated()) {
      return res.json({ 
        user: req.user,
        expiresAt: req.session?.cookie?.expires 
      });
    }
    return res.status(401).json({ error: 'Unauthorized' });
  };
}

function authorMe() {
  return (req, res) => {
    if (!req.user?.isAuthor) return res.status(403).json({ error: 'Forbidden' });
    return res.json({ user: { email: req.user.email, role: 'author', isAuthor: true } });
  };
}

module.exports = {
  login,
  logout,
  googleDebug,
  googleCallback,
  me,
  authorMe,
};
