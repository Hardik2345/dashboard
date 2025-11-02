// Phase 1: minimal CommonJS controller to preserve existing behavior for /auth/me
const AuthController = {
  // login(req,res,next) {},
  // logout(req,res) {},
  me(req, res) {
    if (req.isAuthenticated && req.isAuthenticated()) {
      return res.json({ user: req.user });
    }
    return res.status(401).json({ error: 'Unauthorized' });
  },
};

module.exports = AuthController;
