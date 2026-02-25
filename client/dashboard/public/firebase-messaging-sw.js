// Give the service worker access to Firebase Messaging.
// Note: You must allow this file to be loaded from the root logic.

importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');


// Initialize the Firebase app in the service worker by passing in
// your app's Firebase config object.
// https://firebase.google.com/docs/web/setup#config-object
firebase.initializeApp({
  apiKey: "AIzaSyCY6hO0f5Y-vukki1C3hbFkFNun-wRJGgM",
  authDomain: "dashboard-notifications-fde8d.firebaseapp.com",
  projectId: "dashboard-notifications-fde8d",
  storageBucket: "dashboard-notifications-fde8d.firebasestorage.app",
  messagingSenderId: "159691205555",
  appId: "1:159691205555:web:f5a1951d505ed8395679c6"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  // Customize notification here
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/favicon.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
