const { sendTopicNotification } = require('../notificationService'); // Use topic service
const logger = require('../../utils/logger');

/**
 * Push Dispatcher
 * Formats messages and sends to eligible users via Topics.
 * (Switched to Topics as 'users.fcm_token' column does not exist).
 */

/**
 * Format the Push Message.
 * Mandatory Format: "{brand_name}: CVR down 18% vs yesterday (same hour), and 12% vs 5-day avg"
 * 
 * @param {string} brandName 
 * @param {object} comparisonResult - { primaryDiff, secondaryDiff, secondaryDrop }
 * @returns {string} Formatted Body
 */
function formatMessage(brandName, comparisonResult) {
    const { primaryDiff, secondaryDiff } = comparisonResult;

    // primaryDiff is negative for drop. e.g. -18.3
    const pDirection = primaryDiff < 0 ? 'down' : 'up';
    const pVal = Math.round(Math.abs(primaryDiff));

    let body = `${brandName}: CVR ${pDirection} ${pVal}% vs yesterday (same hour)`;

    // "and 12% vs 5-day avg" 
    if (secondaryDiff !== undefined && secondaryDiff !== null && !isNaN(secondaryDiff)) {
        const sDirection = secondaryDiff < 0 ? 'down' : 'up';
        const sVal = Math.round(Math.abs(secondaryDiff));
        body += `, and ${sDirection} ${sVal}% vs 5-day avg`;
    }

    return body;
}

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
        const title = `🚨 ${brandName} CVR Alert`;
        const body = customBody || formatMessage(brandName, comparisonResult);

        logger.info(`[PushDispatcher] Sending '${body}' via Topics`);

        // Calculate Time Context for Deep Link
        const istOffset = (Number(process.env.IST_OFFSET_HOURS) || 5.5) * 60 * 60 * 1000;
        const now = new Date();
        const istDate = new Date(now.getTime() + istOffset);
        const dateStr = istDate.toISOString().split('T')[0]; // YYYY-MM-DD
        const hour = istDate.getUTCHours();

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
