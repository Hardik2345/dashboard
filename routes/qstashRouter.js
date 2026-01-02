const express = require('express');
const { buildQStashController } = require('../controllers/qstashController');

function buildQStashRouter(deps) {
    const router = express.Router();
    const controller = buildQStashController(deps);

    // POST /webhooks/qstash
    // The mount point in app.js will likely determine the prefix.
    // We will mount this router at /webhooks/qstash or similar.
    // So the route here should be / or /events.
    // Let's use / (root of this router) for maximum flexibility if mounted specifically.
    router.post('/', express.json(), controller.handleEvent);

    return router;
}

module.exports = { buildQStashRouter };
