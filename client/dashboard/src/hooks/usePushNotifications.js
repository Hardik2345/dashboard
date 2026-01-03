import { useEffect } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { messaging } from '../lib/firebase';
import axios from 'axios';

export default function usePushNotifications(user) {
    useEffect(() => {
        // Only subscribe if user is logged in AND is an author
        if (!user || !user.isAuthor) return;

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
                        // User requested to only subscribe to 'admin' topic to receive all notifications and avoid duplicates.
                        const topics = ['admin'];

                        // Previously subscribed to brand topic as well, causing duplicates.
                        // const brandKey = user.brandKey || 'tmc';
                        // topics.push(`brand-${brandKey}`);

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
