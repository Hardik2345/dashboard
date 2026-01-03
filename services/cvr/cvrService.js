const cvrCalculator = require('./cvrCalculator');
const redisFetcher = require('./redisFetcher');
const comparisonEngine = require('./comparisonEngine');
const stateManager = require('./stateManager');
const cooldownHandler = require('./cooldownHandler');
const zeroMetricsHandler = require('./zeroMetricsHandler');
const pushDispatcher = require('./pushDispatcher');
const logger = require('../../utils/logger');
const { getBrands } = require('../../config/brands');

// CVR is evaluated hourly.
// INPUT EVENT: { brand_id, brand, total_sales, total_orders, total_sessions, ... }

/**
 * Main Entry Point for CVR Alert Processing
 * Called by QStash Controller.
 * 
 * @param {object} event 
 */
async function processCVREvent(event) { 
    const brandName = event.brand || ''; // "tmc"
    const brandId = event.brand_id;

    if (!brandName || !brandId) {
        logger.warn('[CVR Service] Missing brand info in event', event);
        return;
    }

    // Resolve Brand Key for User Lookup (Author mapping uses brand_key)
    const brandKey = brandName;

    // 1. Zero Metrics Exception Logic
    if (zeroMetricsHandler.isZeroMetricEvent(event)) {
        logger.info(`[CVR Service] Zero metrics detected for ${brandName}`);
        const shouldSend = await zeroMetricsHandler.shouldSendZeroException(brandName);
        if (shouldSend) {
            await pushDispatcher.sendCVRAlert(brandName, brandKey, null,
                `${brandName}: Critical Data Exception - All key metrics are zero. Check ingestion pipelines.`
            );
        }
        return; // Stop processing
    } else {
        await zeroMetricsHandler.clearZeroException(brandName);
    }

    // 2. Compute Current CVR
    // Note: using keys 'total_orders'/'total_sessions' from event payload as standard input
    // QStash payload shown in logs matched keys.
    const currentOrders = Number(event.total_orders);
    const currentSessions = Number(event.total_sessions);
    const currentCVR = cvrCalculator.calculateCVR(currentOrders, currentSessions);

    // 3. Get Time Context (IST)
    const now = new Date();
    const istOffset = (Number(process.env.IST_OFFSET_HOURS) || 5.5) * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const currentHour = istDate.getUTCHours();

    // Yesterday
    const yesterday = new Date(istDate);
    yesterday.setDate(yesterday.getDate() - 1);

    logger.info(`[CVR Service] Processing ${brandName} CVR: ${currentCVR.toFixed(2)}% (Hour: ${currentHour} IST)`);

    // 4. Fetch History
    const yesterdayCVR = await redisFetcher.fetchHourlyCVR(brandName, yesterday, currentHour);
    const fiveDayAvgCVR = await redisFetcher.fetch5DaySameHourAvg(brandName, istDate, currentHour);

    logger.debug(`[CVR Service] History for ${brandName}: Yesterday=${yesterdayCVR}, 5DayAvg=${fiveDayAvgCVR}`);

    // check if we have enough data
    if (yesterdayCVR === null) {
        logger.info(`[CVR Service] Missing yesterday's data for ${brandName}. Skipping logic.`);
        return;
    }

    // 5. Compare
    const comparison = comparisonEngine.compareMetrics(currentCVR, yesterdayCVR, fiveDayAvgCVR);

    // 6. State Machine
    const { newState, shouldPush, transition } = await stateManager.determineStateTransition(brandName, comparison.primaryState);

    logger.info(`[CVR Service] State: ${await stateManager.getCurrentState(brandName)} -> ${newState} (Transition: ${transition})`);

    await stateManager.setCurrentState(brandName, newState);

    // 7. Push Logic & Cooldown
    // Update: If State Changed (shouldPush is true), RESET cooldown and FORCE push.
    // If State did NOT change, we generally don't push.

    if (shouldPush) {
        logger.info(`[CVR Service] State changed (${transition}). Force pushing and resetting cooldown.`);

        // 1. Send Alert
        await pushDispatcher.sendCVRAlert(brandName, brandKey, comparison);

        // 2. Reset Cooldown (Set it to start from NOW)
        await cooldownHandler.setCooldown(brandName);
        return;
    }

    // No Push (No state change)
    logger.info(`[CVR Service] No state change or non-pushable transition (${transition}). No push.`);
}

module.exports = { processCVREvent };
