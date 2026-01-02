const redisClient = require('../../lib/redis');
const logger = require('../../utils/logger');

const EXCEPTION_KEY_PREFIX = 'alert_zero_exception'; // alert_zero_exception:{brand}

/**
 * Check if event is all-zero metrics.
 * 
 * @param {object} event 
 * @returns {boolean}
 */
function isZeroMetricEvent(event) {
    // Check key metrics
    const orders = Number(event.total_orders) || 0;
    const sessions = Number(event.total_sessions) || 0;
    const sales = Number(event.total_sales) || 0;

    return (orders === 0 && sessions === 0 && sales === 0);
}

/**
 * Handle "One Exception" rule for zero metrics.
 * 
 * @param {string} brandName 
 * @returns {Promise<boolean>} true if we should SEND the exception alert (first time), false if already sent (recursion prevention)
 */
async function shouldSendZeroException(brandName) {
    if (!redisClient) return true; // Default to send if no cache (safety)
    const key = `${EXCEPTION_KEY_PREFIX}:${brandName}`;

    // Check if exception state already exists
    const exists = await redisClient.get(key);
    if (exists) {
        return false; // Already sent exception, suppress
    }

    // Set exception state. 
    // How long? Until metrics recover? 
    // The prompt says "Exception state must be stored to prevent recursion".
    // Does it reset? Implicitly when we get a NON-zero event?
    // "Subsequent zero-metric events: Must NOT trigger additional pushes"
    // We should set it with no expiry? Or maybe daily?
    // Let's set 24h to be safe, or until cleared manually/by recovery.
    // Ideally, Orchestrator clears this key when valid metrics arrive.
    // I will implement `clearZeroException` for that purpose.
    await redisClient.setex(key, 24 * 60 * 60, '1'); // 24 hours safety
    return true;
}

async function clearZeroException(brandName) {
    if (!redisClient) return;
    const key = `${EXCEPTION_KEY_PREFIX}:${brandName}`;
    await redisClient.del(key);
}

module.exports = {
    isZeroMetricEvent,
    shouldSendZeroException,
    clearZeroException
};
