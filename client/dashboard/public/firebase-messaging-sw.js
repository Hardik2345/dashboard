importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCY6hO0f5Y-vukki1C3hbFkFNun-wRJGgM',
  authDomain: 'dashboard-notifications-fde8d.firebaseapp.com',
  projectId: 'dashboard-notifications-fde8d',
  storageBucket: 'dashboard-notifications-fde8d.firebasestorage.app',
  messagingSenderId: '159691205555',
  appId: '1:159691205555:web:f5a1951d505ed8395679c6',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/favicon.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
