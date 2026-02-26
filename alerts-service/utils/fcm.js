const admin = require('firebase-admin');
const path = require('path');

// Use stdout/stderr directly so FCM logs are always visible even in production
// (logger.js silences all console.* in NODE_ENV=production)
const fcmLog = (...args) => process.stdout.write('[FCM] ' + args.join(' ') + '\n');
const fcmErr = (...args) => process.stderr.write('[FCM ERROR] ' + args.join(' ') + '\n');

let firebaseInitialized = false;

// Initialize Firebase Admin SDK
try {
    let serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    if (!serviceAccountPath) {
        fcmErr('FIREBASE_SERVICE_ACCOUNT_PATH is not set. FCM will not work.');
    } else {
        const resolvedPath = path.resolve(__dirname, '..', serviceAccountPath);
        fcmLog('Loading service account from:', resolvedPath);
        const serviceAccount = require(resolvedPath);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        firebaseInitialized = true;
        fcmLog('Firebase Admin initialized successfully');
    }
} catch (error) {
    fcmErr('Failed to initialize Firebase Admin:', error.message || error);
}

/**
 * Send push notification to all stored FCM tokens
 * @param {import('mongoose').Connection} mongooseConnection
 * @param {string} title
 * @param {string} body
 * @param {object} data
 */
async function sendToAll(mongooseConnection, title, body, data = {}) {
    if (!firebaseInitialized || !admin.apps.length) {
        fcmErr('FCM not configured (initialized=' + firebaseInitialized + ', apps=' + admin.apps.length + '), skipping dispatch');
        return;
    }

    try {
        const fcmTokensCollection = mongooseConnection.collection('fcm_tokens');
        const tokensDoc = await fcmTokensCollection.find({}).toArray();
        const tokens = tokensDoc.map(doc => doc.token).filter(Boolean);

        fcmLog('Found', tokens.length, 'FCM token(s). Sending:', title);

        if (tokens.length === 0) {
            fcmLog('No FCM tokens registered, skipping dispatch');
            return;
        }

        const payload = {
            notification: { title, body },
            data: {
                ...data,
                click_action: 'FLUTTER_NOTIFICATION_CLICK'
            }
        };

        const stringifiedData = {};
        for (const [key, value] of Object.entries(payload.data)) {
            stringifiedData[key] = String(value);
        }
        payload.data = stringifiedData;

        const response = await admin.messaging().sendEachForMulticast({
            tokens,
            ...payload
        });

        fcmLog('FCM result: Success=' + response.successCount + ', Failure=' + response.failureCount);

        // Log individual failures for debugging
        if (response.failureCount > 0) {
            const failedTokens = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    fcmErr('Token #' + idx + ' failed:', resp.error?.code, resp.error?.message);
                    if (resp.error?.code === 'messaging/invalid-registration-token' ||
                        resp.error?.code === 'messaging/registration-token-not-registered') {
                        failedTokens.push(tokens[idx]);
                    }
                }
            });

            if (failedTokens.length > 0) {
                await fcmTokensCollection.deleteMany({ token: { $in: failedTokens } });
                fcmLog('Cleaned up', failedTokens.length, 'invalid FCM tokens');
            }
        }
    } catch (err) {
        fcmErr('Error sending FCM messages:', err.message || err);
        throw err;
    }
}

module.exports = { sendToAll };
