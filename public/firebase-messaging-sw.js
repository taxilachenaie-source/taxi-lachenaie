importScripts(
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js"
);

firebase.initializeApp({
  apiKey: "AIzaSyDbDQNhyYIklQl810l12eV4DKVxZW3DOHE",
  authDomain: "taxi-lachenaie-d4afd.firebaseapp.com",
  projectId: "taxi-lachenaie-d4afd",
  storageBucket: "taxi-lachenaie-d4afd.firebasestorage.app",
  messagingSenderId: "636603717453",
  appId: "1:636603717453:web:11be170600f2d780cc4904",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title =
    payload.notification?.title ||
    payload.data?.title ||
    "🚖 Taxi Lachenaie";

  const body =
    payload.notification?.body ||
    payload.data?.body ||
    "Une nouvelle course est disponible.";

  const reservationId =
    payload.data?.reservation_id || "";

  const notificationOptions = {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: reservationId
      ? `reservation-${reservationId}`
      : "taxi-lachenaie",
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 150, 300, 150, 500],
    data: {
      url: payload.data?.url || "/chauffeur",
      reservation_id: reservationId,
    },
  };

  return self.registration.showNotification(
    title,
    notificationOptions
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const destination =
    event.notification.data?.url || "/chauffeur";

  event.waitUntil(
    clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(destination);
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(destination);
      }

      return undefined;
    })
  );
});