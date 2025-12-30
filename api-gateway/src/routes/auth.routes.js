const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

const jwksController = require('../controllers/jwks.controller');

router.get('/.well-known/jwks.json', jwksController.getJwks);
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/logout-all-self', authController.logoutAllSelf);

module.exports = router;
