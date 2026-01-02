/**
 * Comparison Engine
 * Handles Primary and Secondary comparisons.
 */

/**
 * Compare CVR values to determine status.
 * 
 * Rules:
 * Primary (State-Defining): Today < Yesterday (Degradation). Today > Yesterday (>5%) (Improvement).
 * Secondary (Context): Today < 5-Day Avg (Degradation context).
 * 
 * @param {number} currentCVR 
 * @param {number|null} yesterdayCVR 
 * @param {number|null} fiveDayAvgCVR 
 */
function compareMetrics(currentCVR, yesterdayCVR, fiveDayAvgCVR) {
    const result = {
        primaryState: 'NORMAL', // 'DEGRADED' | 'NORMAL' (We treat Improved as returning to Normal or better)
        isImrpoved: false,
        primaryDiff: 0,
        secondaryDiff: 0,
        secondaryDrop: false
    };

    // 1. Primary Comparison (Today vs Yesterday Same Hour)
    if (yesterdayCVR !== null && yesterdayCVR > 0) {
        // Calculate difference percentage
        // (Current - Yesterday) / Yesterday * 100
        const diff = ((currentCVR - yesterdayCVR) / yesterdayCVR) * 100;
        result.primaryDiff = diff;

        if (currentCVR < yesterdayCVR) {
            result.primaryState = 'DEGRADED';
        } else if (currentCVR > yesterdayCVR && diff > 5) {
            // Improvement > 5%
            result.isImrpoved = true;
            result.primaryState = 'NORMAL'; // Logic: Improvement moves us away from degraded
        } else {
            // Equal or small increase
            result.primaryState = 'NORMAL';
        }
    }

    // 2. Secondary Comparison (Today vs 5-Day Avg Same Hour)
    if (fiveDayAvgCVR !== null && fiveDayAvgCVR > 0) {
        const diff = ((currentCVR - fiveDayAvgCVR) / fiveDayAvgCVR) * 100;
        result.secondaryDiff = diff;
        if (currentCVR < fiveDayAvgCVR) {
            result.secondaryDrop = true;
        }
    }

    return result;
}

module.exports = { compareMetrics };
