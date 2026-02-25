import { useState, useEffect, useCallback } from 'react';
import { messaging, getToken, onMessage } from '../lib/firebase';
import { registerFcmToken } from '../lib/api';

const noop = async () => null;

export const usePushNotifications = (enabled = true) => {
    const [fcmToken, setFcmToken] = useState(null);
    const [notificationPermissionStatus, setNotificationPermissionStatus] = useState('');

    useEffect(() => {
        if (!enabled) return;
        if (typeof window !== 'undefined' && 'Notification' in window) {
            setNotificationPermissionStatus(Notification.permission);
        }
    }, [enabled]);

    const requestPermissionAndGetToken = useCallback(async () => {
        if (!enabled) return null;
        try {
            if (!('Notification' in window)) {
                console.log('This browser does not support desktop notification');
                return null;
            }

            const permission = await Notification.requestPermission();
            setNotificationPermissionStatus(permission);

            if (permission === 'granted' && messaging) {
                const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
                const currentToken = await getToken(messaging, { vapidKey });

                if (currentToken) {
                    setFcmToken(currentToken);
                    await registerFcmToken(currentToken);
                    return currentToken;
                } else {
                    console.log('No registration token available.');
                    return null;
                }
            } else {
                console.log('Permission not granted for Notification');
                return null;
            }
        } catch (error) {
            console.error('An error occurred while retrieving token. ', error);
            return null;
        }
    }, [enabled]);

    // Listen to foreground notifications (admins only)
    useEffect(() => {
        if (!enabled || !messaging) return;

        const unsubscribe = onMessage(messaging, (payload) => {
            console.log('Message received in foreground: ', payload);
            // Notify the NotificationBell to refresh
            window.dispatchEvent(new CustomEvent('new-push-notification', { detail: payload }));
        });

        return () => unsubscribe();
    }, [enabled]);

    if (!enabled) {
        return { fcmToken: null, requestPermissionAndGetToken: noop, notificationPermissionStatus: '' };
    }

    return {
        fcmToken,
        requestPermissionAndGetToken,
        notificationPermissionStatus
    };
};
