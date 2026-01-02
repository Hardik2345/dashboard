const redisClient = require('../../lib/redis');
const logger = require('../../utils/logger');
const { calculateCVR } = require('./cvrCalculator');

/**
 * Fetch historical CVR data/metrics from Redis.
 */

// Helper to get formatted date string: YYYY-MM-DD
function getDateString(dateObj) {
    return dateObj.toISOString().split('T')[0];
}

/**
 * Helper to extract CVR from "Value" which might be number, JSON string, or object.
 */
function parseVal(val) {
    try {
        if (typeof val === 'string') {
            // Try parsing JSON if it looks like it
            if (val.trim().startsWith('{')) {
                const p = JSON.parse(val);
                return parseVal(p);
            }
            return Number(val);
        }
        if (typeof val === 'number') return val;

        if (typeof val === 'object' && val !== null) {
            if (val.cvr !== undefined) return Number(val.cvr);

            // Standard Keys
            if (val.total_orders !== undefined && val.total_sessions !== undefined) {
                return calculateCVR(val.total_orders, val.total_sessions);
            }

            // Pipeline Actual Keys (fixed based on logs)
            if (val.number_of_orders !== undefined && val.number_of_sessions !== undefined) {
                return calculateCVR(val.number_of_orders, val.number_of_sessions);
            }

            logger.warn(`[RedisFetcher] Failed to parse CVR from object. Keys found: ${Object.keys(val).join(', ')}`);
        }
        // Fallback
        return Number(val);
    } catch (e) { return null; }
}

/**
 * Fetch CVR for a specific hour from yesterday.
 * Handles both Hash (field=hour) and String (JSON blob) types.
 * 
 * @param {string} brandName 
 * @param {Date} dateObj - The date to check (yesterday)
 * @param {number} hour - The hour to check (0-23)
 * @returns {Promise<number|null>} CVR or null if missing
 */
async function fetchHourlyCVR(brandName, dateObj, hour) {
    if (!redisClient) return null;
    const dateStr = getDateString(dateObj);
    const key = `hourly_metrics:${brandName}:${dateStr}`;

    try {
        // Optimistically try Hash first 
        const data = await redisClient.hget(key, String(hour));
        if (data) return parseVal(data);
        return null;
    } catch (err) {
        // Handle WRONGTYPE: Key exists but is not a Hash (likely a JSON String)
        if (err && err.message && err.message.includes('WRONGTYPE')) {
            try {
                const rawJson = await redisClient.get(key);
                if (!rawJson) return null;

                let parsed;
                try {
                    parsed = JSON.parse(rawJson);
                } catch (e) { return null; }

                // Expected format: JSON object { "15": ... }
                if (parsed && typeof parsed === 'object') {
                    // Keys might be strings "15" or numbers 15
                    const hourVal = parsed[String(hour)] || parsed[hour];
                    if (hourVal !== undefined) return parseVal(hourVal);
                }
                return null;
            } catch (e2) {
                logger.error(`[RedisFetcher] Error handling String type for ${key}`, e2);
                return null;
            }
        }

        // Real Redis error
        logger.error(`[RedisFetcher] Error fetching ${key} for hour ${hour}`, err);
        return null;
    }
}

/**
 * Fetch 5-day average CVR for the SAME hour.
 */
async function fetch5DaySameHourAvg(brandName, referenceDate, hour) {
    if (!redisClient) return null;

    let sum = 0;
    let count = 0;

    // Look back 1 to 5 days
    for (let i = 1; i <= 5; i++) {
        const d = new Date(referenceDate);
        d.setDate(d.getDate() - i);

        const cvr = await fetchHourlyCVR(brandName, d, hour);
        if (cvr !== null && !isNaN(cvr)) {
            sum += cvr;
            count++;
        }
    }

    if (count === 0) return null;
    return sum / count;
}

module.exports = {
    fetchHourlyCVR,
    fetch5DaySameHourAvg
};
