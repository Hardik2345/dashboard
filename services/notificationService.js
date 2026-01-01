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
    return response;
  } catch (error) {
    logger.error('[NotificationService] Error sending to topic:', error);
    throw error;
  }
}

module.exports = {
  sendPushNotification,
  sendTopicNotification
};
