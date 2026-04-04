const express = require('express');
const { getQrScans, getLandingPageSessions, getMongoEventCount, getMongoCollectionCount } = require('./dataService');
const { requireTrustedPrincipal } = require('../../shared/middleware/identityEdge');

function buildRanvirRouter() {
  const router = express.Router();

  router.get('/qr-scans', requireTrustedPrincipal, async (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing required parameters: from and to' });
    try {
      const result = await getQrScans(from, to);
      res.json({ success: true, count: result.count, data: result.data });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/landing-page-sessions', requireTrustedPrincipal, async (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing required parameters: from and to' });
    try {
      const result = await getLandingPageSessions(from, to);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/mongo-event-count', requireTrustedPrincipal, async (req, res) => {
    const { from, to, eventType } = req.query;
    if (!from || !to || !eventType) {
      return res.status(400).json({ error: 'Missing required parameters: from, to, and eventType' });
    }
    try {
      const result = await getMongoEventCount(from, to, eventType);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/mongo-collection-count', requireTrustedPrincipal, async (req, res) => {
    const { from, to, collectionName } = req.query;
    if (!from || !to || !collectionName) {
      return res.status(400).json({ error: 'Missing required parameters: from, to, and collectionName' });
    }
    try {
      const result = await getMongoCollectionCount(from, to, collectionName);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = { buildRanvirRouter };
