// Give the service worker access to Firebase Messaging.
// Note: You must allow this file to be loaded from the root logic.

importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');


// Initialize the Firebase app in the service worker by passing in
// your app's Firebase config object.
// https://firebase.google.com/docs/web/setup#config-object
firebase.initializeApp({
  apiKey: "AIzaSyAfDggFGLHrR91uUWpxICSYJu57XkTDSWg",
  authDomain: "datum-push-test.firebaseapp.com",
  projectId: "datum-push-test",
  storageBucket: "datum-push-test.firebasestorage.app",
  messagingSenderId: "404123337738",
  appId: "1:404123337738:web:eaf5899b153e9e5a928bf3"
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
