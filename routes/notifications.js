const express = require('express');
const admin = require('firebase-admin');
const logger = require('../utils/logger');
const { getRecentNotifications } = require('../services/notificationService');

// Ensure Firebase is initialized
try {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
} catch (error) {
  logger.error('[NotificationsRouter] Firebase admin initialization failed:', error);
}

function buildNotificationsRouter() {
  const router = express.Router();

  // GET /history
  router.get('/history', async (req, res) => {
    try {
      const history = await getRecentNotifications();
      res.json({ history });
    } catch (error) {
      logger.error('[Notifications] History error:', error);
      res.status(500).json({ error: 'Failed to fetch history' });
    }
  });

  // POST /notifications/subscribe
  // Body: { token: string, topic: string }
  // POST /notifications/subscribe
  // Body: { token: string, topic: string | string[] }
  router.post('/subscribe', async (req, res) => {
    const { token, topic, topics } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Missing token' });
    }

    const topicList = [];
    if (Array.isArray(topics)) topicList.push(...topics);
    if (typeof topic === 'string') topicList.push(topic);

    if (topicList.length === 0) {
      return res.status(400).json({ error: 'No topics provided' });
    }

    try {
      await Promise.all(topicList.map(t => admin.messaging().subscribeToTopic(token, t)));
      logger.info(`[Notifications] Subscribed token to ${topicList.length} topics:`, topicList);
      res.json({ success: true, message: `Subscribed to ${topicList.length} topics`, topics: topicList });
    } catch (error) {
      logger.error('[Notifications] Subscribe error:', error);
      res.status(500).json({ error: 'Failed to subscribe', details: error.message });
    }
  });

  return router;
}

module.exports = { buildNotificationsRouter };
