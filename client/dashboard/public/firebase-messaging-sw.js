importScripts("https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js");
importScripts(
  "https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js",
);

firebase.initializeApp({
  apiKey: "AIzaSyCY6hO0f5Y-vukki1C3hbFkFNun-wRJGgM",
  authDomain: "dashboard-notifications-fde8d.firebaseapp.com",
  projectId: "dashboard-notifications-fde8d",
  storageBucket: "dashboard-notifications-fde8d.firebasestorage.app",
  messagingSenderId: "159691205555",
  appId: "1:159691205555:web:f5a1951d505ed8395679c6",
});

const messaging = firebase.messaging();

// Force update on new service worker version
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Received background message ",
    payload,
  );

  // Use either notification or data fields, providing fallbacks
  const notificationTitle =
    payload.notification?.title ||
    payload.data?.title ||
    "Tech It Dashboard Alert";
  const notificationOptions = {
    body:
      payload.notification?.body ||
      payload.data?.body ||
      "New activity detected on your dashboard.",
    icon: payload.notification?.icon || payload.data?.icon || "/favicon.png",
    badge: "/favicon.png",
    tag: payload.data?.brand || "alert-notification", // Group by brand if possible
    renotify: true,
    data: {
      ...payload.data,
      brand:
        payload.data?.brand ||
        payload.notification?.click_action?.split("brand=")[1],
    },
  };

  return self.registration.showNotification(
    notificationTitle,
    notificationOptions,
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const brand = event.notification.data?.brand;
  const targetUrl = brand ? `/?brand=${encodeURIComponent(brand)}` : "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // If a window is already open, focus it and navigate to the brand URL
        for (const client of clientList) {
          if (client.url.includes(location.origin) && "focus" in client) {
            return client.focus().then((focusedClient) => {
              return focusedClient.navigate(targetUrl);
            });
          }
        }
        // If no window is open, open a new one
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      }),
  );
});
