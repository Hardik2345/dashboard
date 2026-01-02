const redisClient = require('../../lib/redis');
const logger = require('../../utils/logger');

const STATE_KEY_PREFIX = 'alert_state'; // alert_state:{brand}:cvr

/**
 * State Manager
 * Manages transitions: NORMAL <-> DEGRADED <- RECOVERED
 */

async function getCurrentState(brandName) {
    if (!redisClient) return 'NORMAL';
    const key = `${STATE_KEY_PREFIX}:${brandName}:cvr`;
    const state = await redisClient.get(key);
    return state || 'NORMAL';
}

async function setCurrentState(brandName, state) {
    if (!redisClient) return;
    const key = `${STATE_KEY_PREFIX}:${brandName}:cvr`;
    // Set with no expiry? Or long expiry?
    // "Persistent alert state". So no expiry.
    await redisClient.set(key, state);
}

/**
 * Determine transition and if push is needed.
 * 
 * Allowed Push Transitions:
 * NORMAL -> DEGRADED (Push YES)
 * DEGRADED -> RECOVERED (Push YES)
 * DEGRADED -> DEGRADED (Push NO)
 * NORMAL -> NORMAL (Push NO)
 * 
 * Rules After Push:
 * If RECOVERED push sent -> Reset state to NORMAL instantly (effectively).
 * 
 * @param {string} brandName 
 * @param {string} computedState - 'DEGRADED' or 'NORMAL' (based on comparison)
 * @returns {object} { newState, shouldPush, transition }
 */
async function determineStateTransition(brandName, computedState) {
    const currentState = await getCurrentState(brandName);

    // Default result
    let result = {
        newState: computedState,
        shouldPush: false,
        transition: 'NONE'
    };

    if (currentState === 'NORMAL' && computedState === 'DEGRADED') {
        result.shouldPush = true;
        result.transition = 'NORMAL_TO_DEGRADED';
        result.newState = 'DEGRADED';
    }
    else if (currentState === 'DEGRADED' && computedState === 'NORMAL') {
        // This is the Recovery event
        result.shouldPush = true;
        result.transition = 'DEGRADED_TO_RECOVERED';
        // After recovery push, we conceptually go to NORMAL.
        // But we return 'RECOVERED' as the *event* state, and persist NORMAL.
        result.newState = 'NORMAL';
    }
    // Else:
    // DEGRADED -> DEGRADED : No Push
    // NORMAL -> NORMAL : No Push

    return result;
}

module.exports = {
    getCurrentState,
    setCurrentState,
    determineStateTransition
};
