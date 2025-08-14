console.log('Service worker script loaded');

self.addEventListener('install', (event) => {
  console.log('Service Worker installing:', event);
  // Skip waiting to activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating:', event);
  // Claim all clients immediately
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  console.log('Push event received:', event);
  
  let data;
  try {
    data = event.data ? event.data.json() : {};
    console.log('Push data:', data);
  } catch (error) {
    console.error('Error parsing push data:', error);
    data = {
      notification: {
        title: 'New Notification',
        body: 'You have a new message',
        icon: '/icon.png'
      }
    };
  }

  const { title, body, icon } = data.notification || {};

  const notificationOptions = {
    body: body || 'You have a new message',
    icon: icon || '/icon.png',
    badge: '/badge.png',
    vibrate: [200, 100, 200],
    data: data.data || {},
    actions: [
      {
        action: 'open',
        title: 'Open App',
        icon: '/icon.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(
      title || 'New Notification',
      notificationOptions
    )
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  
  event.notification.close();
  
  // Handle notification click
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // If a window is already open, focus it
      for (const client of clientList) {
        if (client.url === self.location.origin && 'focus' in client) {
          return client.focus();
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('Push subscription changed:', event);
  // Handle subscription change if needed
});