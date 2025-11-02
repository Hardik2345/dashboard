// Phase 1: minimal CommonJS controller to preserve existing behavior for /auth/me
const passport = require('passport');

const AuthController = {
  login(req, res, next) {
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
  },
  logout(req, res) {
    req.logout && req.logout(() => {});
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.status(204).end();
    });
  },
  me(req, res) {
    if (req.isAuthenticated && req.isAuthenticated()) {
      return res.json({ user: req.user });
    }
    return res.status(401).json({ error: 'Unauthorized' });
  },
};

module.exports = AuthController;
