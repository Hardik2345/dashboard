const admin = require('firebase-admin');
const path = require('path');
const logger = require('./logger');

// Initialize Firebase Admin SDK
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    || path.join(__dirname, '..', 'config', 'dashboard-notifications-fde8d-firebase-adminsdk-fbsvc-3a481d44d0.json');

let firebaseApp;
try {
    const serviceAccount = require(path.resolve(serviceAccountPath));
    firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
    logger.info('[firebase] Admin SDK initialized');
} catch (err) {
    logger.error('[firebase] Failed to initialize Admin SDK:', err.message);
}

/**
 * Send an FCM notification to all registered device tokens.
 * Automatically removes stale/invalid tokens from the DB.
 *
 * @param {import('mongoose').Connection} db - Mongoose connection
 * @param {string} title - Notification title
 * @param {string} body  - Notification body text
 * @param {object} [data] - Optional data payload
 */
async function sendToAll(db, title, body, data = {}) {
    if (!firebaseApp) {
        logger.warn('[firebase] SDK not initialized, skipping push');
        return;
    }

    const tokensCol = db.collection('fcm_tokens');
    const docs = await tokensCol.find({ role: 'admin' }).toArray();

    if (!docs.length) {
        logger.info('[firebase] No registered FCM tokens, skipping push');
        return;
    }

    const staleTokenIds = [];

    for (const doc of docs) {
        try {
            await admin.messaging().send({
                token: doc.token,
                notification: { title, body },
                data: Object.fromEntries(
                    Object.entries(data).map(([k, v]) => [k, String(v)])
                ),
                webpush: {
                    fcmOptions: { link: '/' },
                },
            });
        } catch (err) {
            const code = err?.code || err?.errorInfo?.code || '';
            if (
                code === 'messaging/invalid-registration-token' ||
                code === 'messaging/registration-token-not-registered'
            ) {
                logger.warn(`[firebase] Removing stale token: ${doc.token.slice(0, 12)}...`);
                staleTokenIds.push(doc._id);
            } else {
                logger.error(`[firebase] Failed to send to token ${doc.token.slice(0, 12)}...:`, err.message);
            }
        }
    }

    // Clean up stale tokens
    if (staleTokenIds.length) {
        await tokensCol.deleteMany({ _id: { $in: staleTokenIds } });
        logger.info(`[firebase] Removed ${staleTokenIds.length} stale token(s)`);
    }
}

module.exports = { sendToAll };
