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
  
  let notificationData = {
    title: 'New Notification',
    body: 'You have a new message',
    icon: '/icon.png'
  };

  // Parse the push data if available
  if (event.data) {
    try {
      const pushData = event.data.json();
      console.log('Push data received:', pushData);
      
      // Handle different payload structures
      if (pushData.notification) {
        // Server sends: { notification: { title, body, icon } }
        notificationData = {
          title: pushData.notification.title || notificationData.title,
          body: pushData.notification.body || notificationData.body,
          icon: pushData.notification.icon || notificationData.icon
        };
      } else if (pushData.title || pushData.body) {
        // Server sends: { title, body, icon }
        notificationData = {
          title: pushData.title || notificationData.title,
          body: pushData.body || notificationData.body,
          icon: pushData.icon || notificationData.icon
        };
      }
    } catch (error) {
      console.error('Error parsing push data:', error);
      // Use default notification data
    }
  }

  console.log('Showing notification with data:', notificationData);

  const notificationOptions = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: '/badge.png',
    vibrate: [200, 100, 200],
    data: { 
      timestamp: Date.now(),
      url: '/'
    },
    actions: [
      {
        action: 'open',
        title: 'Open App'
      },
      {
        action: 'close',
        title: 'Close'
      }
    ],
    requireInteraction: false,
    tag: 'notification-' + Date.now()
  };

  // This is the critical part - actually show the notification
  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationOptions)
      .then(() => {
        console.log('Notification displayed successfully');
      })
      .catch((error) => {
        console.error('Error showing notification:', error);
      })
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  
  event.notification.close();
  
  // Handle different actions
  if (event.action === 'close') {
    console.log('User chose to close the notification');
    return;
  }
  
  // Handle notification click (open action or general click)
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      console.log('Found clients:', clientList.length);
      
      // If a window is already open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          console.log('Focusing existing window');
          return client.focus();
        }
      }
      
      // If no window is open, open a new one
      if (clients.openWindow) {
        console.log('Opening new window');
        return clients.openWindow('/');
      }
    }).catch((error) => {
      console.error('Error handling notification click:', error);
    })
  );
});

self.addEventListener('notificationclose', (event) => {
  console.log('Notification closed:', event);
});

self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('Push subscription changed:', event);
  // Handle subscription change if needed - could re-subscribe here
});