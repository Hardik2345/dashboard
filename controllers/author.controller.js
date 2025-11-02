// Phase 1: minimal CommonJS controller to preserve existing behavior for /author/me
const AuthorController = {
  // listBrands(req,res) {},
  // createBrand(req,res) {},
  me(req, res) {
    if (!req.user?.isAuthor) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return res.json({ user: { email: req.user.email, role: 'author', isAuthor: true } });
  },
};

module.exports = AuthorController;
