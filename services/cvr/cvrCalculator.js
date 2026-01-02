/**
 * CVR Calculator Module
 * Pure logic for calculating Conversion Rate.
 */

/**
 * Calculate CVR from orders and sessions.
 * CVR = (total_orders / total_sessions) * 100
 * Handles divide by zero.
 * 
 * @param {number} orders 
 * @param {number} sessions 
 * @returns {number} CVR percentage (e.g., 2.5 for 2.5%)
 */
function calculateCVR(orders, sessions) {
    const o = Number(orders) || 0;
    const s = Number(sessions) || 0;

    if (s === 0) return 0;
    return (o / s) * 100;
}

module.exports = { calculateCVR };
