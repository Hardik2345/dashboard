const redisClient = require('../../lib/redis');
const logger = require('../../utils/logger');

const COOLDOWN_KEY_PREFIX = 'alert_cooldown'; // alert_cooldown:{brand}:cvr

// ENV Variables
const COOLDOWN_MINUTES = Number(process.env.COOLDOWN_MINUTES) || 180;
const CRITICAL_THRESHOLD = Number(process.env.CRITICAL_CVR_DROP_THRESHOLD) || 50; // 50% drop

/**
 * Check if cooldown is active.
 * Handles Critical Threshold Override.
 * 
 * @param {string} brandName 
 * @param {number} primaryDiff - The % difference (-ve for drop)
 * @returns {Promise<boolean>} true if BLOCKED by cooldown, false if allowed (active or overridden)
 */
async function isCooldownActive(brandName, primaryDiff) {
    if (!redisClient) return false;
    const key = `${COOLDOWN_KEY_PREFIX}:${brandName}:cvr`;
    const ttl = await redisClient.ttl(key);

    if (ttl > 0) {
        // Cooldown exists. Check for Critical Override.
        // primaryDiff is e.g. -60 for 60% drop.
        // If Drop > Threshold (e.g. 60 > 50), we override.
        if (primaryDiff < 0 && Math.abs(primaryDiff) > CRITICAL_THRESHOLD) {
            logger.info(`[Cooldown] Critical Override for ${brandName}: Drop ${Math.abs(primaryDiff)}% > ${CRITICAL_THRESHOLD}%`);
            return false; // Allowed despite cooldown
        }
        return true; // Blocked
    }
    return false;
}

/**
 * Set cooldown.
 * 
 * @param {string} brandName 
 */
async function setCooldown(brandName) {
    if (!redisClient) return;
    const key = `${COOLDOWN_KEY_PREFIX}:${brandName}:cvr`;
    // TTL in seconds
    await redisClient.setex(key, COOLDOWN_MINUTES * 60, '1');
}

module.exports = {
    isCooldownActive,
    setCooldown
};
