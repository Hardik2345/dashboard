const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

const jwksController = require('../controllers/jwks.controller');

router.get('/.well-known/jwks.json', jwksController.getJwks);
router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/logout-all-self', authController.logoutAllSelf);
router.get('/me', authController.me);
router.get('/google/start', authController.googleStart);
router.get('/google/callback', authController.googleCallback);
router.post('/admin/users', authController.adminUpsertUser);
router.delete('/admin/users/:email', authController.adminDeleteUser);
router.get('/admin/users', authController.adminListUsers);

module.exports = router;
