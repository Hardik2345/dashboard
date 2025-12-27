const express = require('express');
const admin = require('firebase-admin');

function buildNotificationsRouter() {
  const router = express.Router();

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
      const results = await Promise.all(topicList.map(t => admin.messaging().subscribeToTopic(token, t)));
      console.log(`[Notifications] Subscribed token to ${topicList.length} topics:`, topicList);
      res.json({ success: true, message: `Subscribed to ${topicList.length} topics`, topics: topicList });
    } catch (error) {
      console.error('[Notifications] Subscribe error:', error);
      res.status(500).json({ error: 'Failed to subscribe', details: error.message });
    }
  });

  return router;
}

module.exports = { buildNotificationsRouter };
