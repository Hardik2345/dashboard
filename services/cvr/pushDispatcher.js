const { sendTopicNotification } = require('../notificationService'); // Use topic service
const logger = require('../../utils/logger');

/**
 * Push Dispatcher
 * Formats messages and sends to eligible users via Topics.
 * (Switched to Topics as 'users.fcm_token' column does not exist).
 */

const { generateMessage } = require('./messageUtils');

/**
 * Push Dispatcher
 * Formats messages and sends to eligible users via Topics.
 * (Switched to Topics as 'users.fcm_token' column does not exist).
 */

/**
 * Send the CVR Alert
 * 
 * @param {string} brandName 
 * @param {string} brandKey 
 * @param {object} comparisonResult 
 * @param {string} [customBody] - For Zero Exception or manual overrides
 */
async function sendCVRAlert(brandName, brandKey, comparisonResult, customBody = null) {
    try {
        // Calculate Time Context for Deep Link & Deterministic Variation
        const istOffset = (Number(process.env.IST_OFFSET_HOURS) || 5.5) * 60 * 60 * 1000;
        const now = new Date();
        const istDate = new Date(now.getTime() + istOffset);
        const dateStr = istDate.toISOString().split('T')[0]; // YYYY-MM-DD
        const hour = istDate.getUTCHours();

        let body = customBody;
        if (!body) {
            // Use Deterministic Message Generator
            body = generateMessage(brandName, comparisonResult, dateStr, hour);
        }

        const title = `🚨 ${brandName} CVR Alert`;
        // const body = customBody || formatMessage(brandName, comparisonResult); // Legacy

        logger.info(`[PushDispatcher] Sending '${body}' via Topics`);

        const linkUrl = `/dashboard?brand=${brandName}&date=${dateStr}&hour=${hour}`;

        const payload = {
            type: 'cvr_alert',
            brand: brandName,
            brand_key: brandKey,
            url: linkUrl,
            link: linkUrl // Common standard
        };

        // 1. Send to Brand Topic (Authors)
        // Topic Convention: brand-{brandKey}
        const brandTopic = `brand-${brandKey}`;
        // await sendTopicNotification(brandTopic, title, body, payload); // Disabling to avoid duplicate history/socket events

        // 2. Send to Admin Topic (All Brands)
        // Topic Convention: admin
        // Note: Check if admins should receive duplicate if they subscribe to brand?
        // FCM might duplicate but it guarantees delivery.
        await sendTopicNotification('admin', title, body, payload);

    } catch (e) {
        logger.error('[PushDispatcher] Failed to send alert', e);
    }
}

module.exports = {
    sendCVRAlert
};
