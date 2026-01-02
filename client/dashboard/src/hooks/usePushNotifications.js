import { useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import axios from 'axios';

// Firebase Config (Same as in sw.js)
const firebaseConfig = {
    apiKey: "AIzaSyAfDggFGLHrR91uUWpxICSYJu57XkTDSWg",
    authDomain: "datum-push-test.firebaseapp.com",
    projectId: "datum-push-test",
    storageBucket: "datum-push-test.firebasestorage.app",
    messagingSenderId: "404123337738",
    appId: "1:404123337738:web:eaf5899b153e9e5a928bf3"
};

// Initialize only once
const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

export default function usePushNotifications(user) {
    useEffect(() => {
        // Only subscribe if user is logged in
        if (!user) return;

        async function setupNotifications() {
            try {
                console.log('[FCM] Requesting permission...');
                const permission = await Notification.requestPermission();

                if (permission === 'granted') {
                    console.log('[FCM] Permission granted.');
                    // Get Token
                    // Note: If you have a VAPID key, add it here: { vapidKey: '...' }
                    const currentToken = await getToken(messaging);

                    if (currentToken) {
                        console.log('[FCM] Token received:', currentToken);

                        // Subscribe via Backend
                        // We subscribe to 'admin' (all) and 'brand-tmc' (test)
                        // Ideally this should use user.brandKey
                        const topics = ['admin'];

                        // Assuming user object has brand information or we default to tmc for test
                        const brandKey = user.brandKey || 'tmc';
                        topics.push(`brand-${brandKey}`);

                        console.log('[FCM] Subscribing to topics:', topics);

                        await axios.post('/api/notifications/subscribe', {
                            token: currentToken,
                            topics: topics
                        });
                        console.log('[FCM] Subscription success.');
                    } else {
                        console.log('[FCM] No registration token available. Request permission to generate one.');
                    }
                } else {
                    console.warn('[FCM] Permission denied');
                }
            } catch (err) {
                console.error('[FCM] An error occurred while retrieving token or subscribing.', err);
            }
        }

        setupNotifications();

        // Foreground listener
        const unsubscribe = onMessage(messaging, (payload) => {
            console.log('[FCM] Foreground Message:', payload);
            // Optional: Show toast or custom UI
            // new Notification(payload.notification.title, { body: payload.notification.body });
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };

    }, [user]); // Re-run if user changes
}
