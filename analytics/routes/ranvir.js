const express = require('express');
const { getQrScans, getLandingPageSessions, getMongoEventCount, getMongoCollectionCount } = require('../utils/ajrs_module');

const { requireAuth } = require('../middlewares/auth');

function buildRanvirRouter() {
  const router = express.Router();

  // GET /ranvir/qr-scans?from=1773878400&to=1773964800
  router.get('/qr-scans', requireAuth, async (req, res, next) => {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing required parameters: from and to' });

    try {
      const result = await getQrScans(from, to);
      res.json({ success: true, count: result.count });
    } catch (error) { 
      res.status(500).json({ error: error.message, stack: error.stack });
    }
  });

  // GET /ranvir/landing-page-sessions?from=YYYY-MM-DD&to=YYYY-MM-DD
  router.get('/landing-page-sessions', requireAuth, async (req, res, next) => {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing required parameters: from and to' });

    try {
      const result = await getLandingPageSessions(from, to);
      res.json(result); 
    } catch (error) {
      res.status(500).json({ error: error.message, stack: error.stack });
    }
  });

  // GET /ranvir/mongo-event-count?from=YYYY-MM-DD&to=YYYY-MM-DD&eventType=...
  router.get('/mongo-event-count', requireAuth, async (req, res, next) => {
    const { from, to, eventType } = req.query;
    if (!from || !to || !eventType) {
      return res.status(400).json({ error: 'Missing required parameters: from, to, and eventType' });
    }

    try {
      const result = await getMongoEventCount(from, to, eventType);
      res.json(result); 
    } catch (error) {
      res.status(500).json({ error: error.message, stack: error.stack });
    }
  });

  // GET /ranvir/mongo-collection-count?from=YYYY-MM-DD&to=YYYY-MM-DD&collectionName=...
  router.get('/mongo-collection-count', requireAuth, async (req, res, next) => {
    const { from, to, collectionName } = req.query;
    if (!from || !to || !collectionName) {
      return res.status(400).json({ error: 'Missing required parameters: from, to, and collectionName' });
    }

    try {
      const result = await getMongoCollectionCount(from, to, collectionName);
      res.json(result); 
    } catch (error) {
      res.status(500).json({ error: error.message, stack: error.stack });
    }
  });


  return router;
}

module.exports = { buildRanvirRouter };
