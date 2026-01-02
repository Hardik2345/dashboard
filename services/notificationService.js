const admin = require('firebase-admin');
const logger = require('../utils/logger');

// Initialize Firebase Admin SDK
// Assumes GOOGLE_APPLICATION_CREDENTIALS is set or default auth is available.
// If user has a specific config, they should provide it. 
// For now, initializing without arguments attempts to use ADC (Application Default Credentials).
try {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
} catch (error) {
  logger.error('[NotificationService] Firebase admin initialization failed:', error);
}

/**
 * Send a multicast push notification to tokens.
 * @param {string[]} tokens - Array of FCM tokens
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Optional data payload
 */
async function sendPushNotification(tokens, title, body, data = {}) {
  if (!tokens || tokens.length === 0) return;

  const message = {
    notification: {
      title,
      body,
    },
    data,
    tokens: tokens,
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    logger.info('[NotificationService] Sent success count:', response.successCount);
    logger.info('[NotificationService] Sent failure count:', response.failureCount);

    // Log failed tokens if needed
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
        }
      });
      logger.warn('[NotificationService] Failed tokens:', failedTokens);
    }

    return response;
  } catch (error) {
    logger.error('[NotificationService] Error sending message:', error);
    throw error;
  }
}

const redis = require('../lib/redis'); // Import generic redis client

/**
 * Store notification in Redis (Last 10)
 * Uses a global list 'notifications:history' for simplicity as per requirements ("notifications we got").
 */
async function storeNotification(title, body, data = {}) {
  try {
    const entry = JSON.stringify({
      title,
      body,
      data,
      timestamp: new Date().toISOString()
    });

    const key = 'notifications:history';
    // RPUSH + LTRIM to keep last 10
    // We want to see recent 10. List order: [oldest ... newest] or [newest ... oldest]?
    // "recent 10 notifications". Usually visualized as newest top.
    // If using LPUSH, index 0 is newest.
    // Let's use LPUSH to prepend, and LTRIM 0 9.

    await redis.lpush(key, entry);
    await redis.ltrim(key, 0, 9);

  } catch (e) {
    logger.error('[NotificationService] Failed to store notification history', e);
  }
}

/**
 * Get recent 10 notifications
 * @returns {Promise<Array>}
 */
async function getRecentNotifications() {
  try {
    const raw = await redis.lrange('notifications:history', 0, -1);
    return raw.map(s => JSON.parse(s));
  } catch (e) {
    logger.error('[NotificationService] Failed to fetch history', e);
    return [];
  }
}

/**
 * Send to a single topic
 * @param {string} topic 
 * @param {string} title 
 * @param {string} body 
 * @param {object} data 
 */
async function sendTopicNotification(topic, title, body, data = {}) {
  const message = {
    notification: {
      title,
      body,
    },
    data,
    topic,
  };

  try {
    const response = await admin.messaging().send(message);
    logger.info('[NotificationService] Successfully sent message to topic:', response);

    // Store in history (Global for now, or filter by 'admin' topic?)
    // User sees "notifications we got". If I am admin, I see everything.
    // Ideally we filter. But for "recent 10", let's just log everything sent via this service.
    await storeNotification(title, body, data);

    return response;
  } catch (error) {
    logger.error('[NotificationService] Error sending to topic:', error);
    throw error;
  }
}

module.exports = {
  sendPushNotification,
  sendTopicNotification,
  getRecentNotifications
};
