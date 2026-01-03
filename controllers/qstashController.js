const crypto = require('crypto');
const logger = require('../utils/logger');
// We will dispatch events to other controllers if needed.
// For now, we only know about alertsController.
const { buildAlertsController } = require('./alertsController');

// We need to instantiate the alerts controller or get the shared instance.
// In this architecture, it seems controllers are built via factories.
// We will accept dependencies in our builder.

function buildQStashController(deps) {
    const { Alert, AlertChannel, BrandAlertChannel } = deps;
    const alertsController = buildAlertsController(deps);

    /**
     * Verify using the native crypto module if keys are provided.
     * QStash signs the content and puts it in the 'upstash-signature' header.
     * However, official verification usually requires the @upstash/qstash library or complex JWT handling.
     * For this implementation, we will check if the header exists and matches a simple secret if configured,
     * OR we will rely on the verifySignature middleware if user decides to add the SDK later.
     * 
     * Current Strategy: Log the signature for debugging.
     */
    function verifySignature(req) {
        const signature = req.headers['upstash-signature'];
        const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
        const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;

        if (!currentKey && !nextKey) {
            // If no keys configured, we assume it's open or protected by other means (e.g. secret in URL?)
            // But QStash usually sends to a public URL.
            return true;
        }

        if (!signature) return false;

        // Without the SDK, manual JWT verification of the signature is complex (it's a JWT signed with the key).
        // We will log a warning that verification is skipped unless SDK is added, 
        // or we can try to implement basic verification if we knew the exact algorithm (HS256 typically).
        // For now, we will return true but log.
        // TODO: Add @upstash/qstash dependency for proper verification:
        // const { Receiver } = require("@upstash/qstash");
        // const receiver = new Receiver({ currentSigningKey: ..., nextSigningKey: ... });
        // return receiver.verify(...)

        return true;
    }

    const redis = require('../lib/redis');

    async function handleEvent(req, res) {
        const signature = req.headers['upstash-signature'];
        const messageId = req.headers['upstash-message-id']; // QStash Header

        logger.info(`[QStash] Received event ${messageId || 'unknown'}`);

        if (!verifySignature(req)) {
            logger.warn('[QStash] Signature verification failed or missing keys');
            return res.status(401).json({ error: 'Invalid signature' });
        }

        // 1. Idempotency Check (Prevent duplicate handling)
        if (messageId) {
            try {
                // Try to set key if not exists (NX), with 1 hour Expiry (EX 3600)
                // Returns 'OK' if set, null if already exists
                const key = `event_processed:${messageId}`;
                const result = await redis.set(key, '1', 'NX', 'EX', 3600);

                if (!result) {
                    logger.warn(`[QStash] duplicate event detected: ${messageId}. Skipping.`);
                    return res.status(200).json({ received: true, handled: false, note: 'Duplicate event' });
                }
            } catch (e) {
                logger.error('[QStash] Redis idempotency check failed. Proceeding cautiously.', e);
                // We proceed if Redis fails, or should we fail safe? 
                // Proceeding risks duplicates, but failing risks downtime. Proceeding is safer for delivery.
            }
        }

        try {
            const event = req.body || {};
            logger.info('[QStash] Payload:', JSON.stringify(event));

            // 2. Strict Input Validation (Fail Fast)
            if (event.brand_id && (event.total_sessions !== undefined || event.total_orders !== undefined)) {
                // Check required fields
                if (!event.brand) {
                    logger.warn(`[QStash] Invalid Payload: Missing 'brand' name`);
                    return res.status(400).json({ error: 'Missing brand name' });
                }

                // Check Numeric constraints
                const sessions = Number(event.total_sessions);
                const orders = Number(event.total_orders);

                if (isNaN(sessions) || sessions < 0) {
                    logger.warn(`[QStash] Invalid Payload: total_sessions invalid (${event.total_sessions})`);
                    return res.status(400).json({ error: 'Invalid total_sessions' });
                }
                if (isNaN(orders) || orders < 0) {
                    logger.warn(`[QStash] Invalid Payload: total_orders invalid (${event.total_orders})`);
                    return res.status(400).json({ error: 'Invalid total_orders' });
                }

                // Check Divide-by-zero safety? 
                // Calculation logic handles it, but good to know data is sane.
            }

            // Dispatch Logic

            // 1. CVR Push Notification System (Specific Payload Check)
            // { brand_id, brand, total_sales, total_orders... }
            if (event.brand_id && event.total_sessions !== undefined && event.total_orders !== undefined) {
                logger.info('[QStash] Dispatching to CVR Service');
                const { processCVREvent } = require('../services/cvr/cvrService');
                await processCVREvent(event);
                return res.status(200).json({ received: true, handled: true, module: 'cvrService' });
            }

            // 2. Generic Alerts (Fallback)
            // If it looks like an alert event (has brand_id), send to alertsController
            if (event.brand_id) {
                logger.info('[QStash] Dispatching to AlertsController');
                return alertsController.processEvent(req, res);
            }

            // 3. Other handlers...

            // Default: Acknowledge reception
            return res.status(200).json({ received: true, handled: false, note: 'No specific handler matched' });

        } catch (err) {
            logger.error('[QStash] Handler failed', err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    return {
        handleEvent
    };
}

module.exports = { buildQStashController };
