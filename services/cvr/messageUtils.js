const crypto = require('crypto');

/**
 * Message Banks
 * Each bank contains templates.
 * Placeholders:
 * {brand} - Brand Name
 * {pVal} - Primary Diff Value (Absolute %)
 * {direction} - "down"/"up" (derived context)
 */

const MSG_DROP = [
    "{brand}: CVR down {pVal}% vs yesterday (same hour)",
    "{brand}: Alert - CVR is trailing yesterday by {pVal}%",
    "{brand}: Conversion rate dropped {pVal}% compared to same time yesterday",
    "{brand}: Attention Needed: CVR down {pVal}% vs yesterday's benchmark",
    "{brand}: Performance Alert: CVR is {pVal}% lower than yesterday"
];

const MSG_RECOVERED = [
    "{brand}: CVR has recovered (up {pVal}% vs yesterday)",
    "{brand}: CVR is back to normal levels (up {pVal}% vs yesterday)",
    "{brand}: Recovery: Conversion rate improved by {pVal}% vs yesterday",
    "{brand}: CVR Stabilized: Currently up {pVal}% compare to yesterday",
    "{brand}: Good News: CVR showing recovery (up {pVal}%)"
];

// Fallback if hash fails
const DEFAULT_DROP = "{brand}: CVR down {pVal}% vs yesterday";
const DEFAULT_RECOVERED = "{brand}: CVR up {pVal}% vs yesterday";

/**
 * Stable Hash Function
 * Returns an integer index based on input strings.
 * Core Logic: Sum of char codes or simple crypto hash.
 * We use crypto md5 for better distribution, then modulo.
 */
function getStableIndex(inputString, arrayLength) {
    if (!arrayLength || arrayLength === 0) return 0;
    try {
        const hash = crypto.createHash('md5').update(inputString).digest('hex');
        // Convert first 8 chars of hex to int
        const intVal = parseInt(hash.substring(0, 8), 16);
        return intVal % arrayLength;
    } catch (e) {
        return 0; // Fallback
    }
}

/**
 * Generate Deterministic Message
 * 
 * @param {string} brandName 
 * @param {object} comparisonResult - { primaryDiff, secondaryDiff }
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} hour - 0-23
 */
function generateMessage(brandName, comparisonResult, dateStr, hour) {
    const { primaryDiff, secondaryDiff } = comparisonResult;

    // Determine Type
    const isDrop = primaryDiff < 0;
    const type = isDrop ? 'DROP' : 'RECOVERED';
    const bank = isDrop ? MSG_DROP : MSG_RECOVERED;
    const fallback = isDrop ? DEFAULT_DROP : DEFAULT_RECOVERED;

    // Formatting Values
    const pVal = Math.round(Math.abs(primaryDiff));

    // Create Deterministic Hash Key
    // Key = Brand + Type + Date + Hour
    // e.g. "tmc-DROP-2025-01-05-14"
    const hashKey = `${brandName}-${type}-${dateStr}-${hour}`;

    let template = fallback;
    try {
        // Select Template
        const index = getStableIndex(hashKey, bank.length);
        template = bank[index];
    } catch (e) {
        template = fallback;
    }

    // Inject Values
    let body = template
        .replace(/{brand}/g, brandName)
        .replace(/{pVal}/g, pVal);

    // Append Secondary Metrics (Standardized, not varied to keep clarity)
    // "and 12% vs 5-day avg"
    if (secondaryDiff !== undefined && secondaryDiff !== null && !isNaN(secondaryDiff)) {
        const sDirection = secondaryDiff < 0 ? 'down' : 'up';
        const sVal = Math.round(Math.abs(secondaryDiff));
        body += `, and ${sDirection} ${sVal}% vs 5-day avg`;
    }

    return body;
}

module.exports = {
    generateMessage
};
