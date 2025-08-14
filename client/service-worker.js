/**
 * Service Worker for Push Notifications
 * Handles push notification events, notification clicks, and service worker lifecycle
 * @file service-worker.js
 * @description This service worker manages push notifications for the web application,
 * including receiving push messages, displaying notifications, and handling user interactions
 */

console.log('Service worker script loaded');

/**
 * Service Worker install event handler
 * Triggered when the service worker is first installed
 * @param {ExtendableEvent} event - The install event
 */
self.addEventListener('install', (event) => {
  console.log('Service Worker installing:', event);
  // Skip waiting to activate immediately (bypasses waiting state)
  self.skipWaiting();
});

/**
 * Service Worker activate event handler
 * Triggered when the service worker becomes active
 * @param {ExtendableEvent} event - The activate event
 */
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating:', event);
  // Claim all clients immediately (takes control of all pages)
  event.waitUntil(self.clients.claim());
});

/**
 * Push event handler
 * Receives push messages from the server and displays notifications
 * @param {PushEvent} event - The push event containing notification data
 */
self.addEventListener('push', (event) => {
  console.log('Push event received:', event);
  
  // Default notification data as fallback
  let notificationData = {
    title: 'New Notification',
    body: 'You have a new message',
    icon: '/icon.png'
  };

  // Parse the push data if available from the server
  if (event.data) {
    try {
      const pushData = event.data.json();
      console.log('Push data received:', pushData);
      
      // Handle different payload structures from the server
      if (pushData.notification) {
        // Server sends nested structure: { notification: { title, body, icon } }
        notificationData = {
          title: pushData.notification.title || notificationData.title,
          body: pushData.notification.body || notificationData.body,
          icon: pushData.notification.icon || notificationData.icon
        };
      } else if (pushData.title || pushData.body) {
        // Server sends flat structure: { title, body, icon }
        notificationData = {
          title: pushData.title || notificationData.title,
          body: pushData.body || notificationData.body,
          icon: pushData.icon || notificationData.icon
        };
      }
    } catch (error) {
      console.error('Error parsing push data:', error);
      // Fall back to default notification data if parsing fails
    }
  }

  console.log('Showing notification with data:', notificationData);

  // Configure notification options with actions and styling
  const notificationOptions = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: '/badge.png', // Small icon shown in status bar
    vibrate: [200, 100, 200], // Vibration pattern for mobile devices
    data: { 
      timestamp: Date.now(),
      url: '/' // URL to open when notification is clicked
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
    requireInteraction: false, // Notification auto-dismisses
    tag: 'notification-' + Date.now() // Unique identifier for this notification
  };

  // Display the notification to the user
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

/**
 * Notification click event handler
 * Handles user interactions with notifications (clicks and action buttons)
 * @param {NotificationEvent} event - The notification click event
 */
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  
  // Close the notification
  event.notification.close();
  
  // Handle different action button clicks
  if (event.action === 'close') {
    console.log('User chose to close the notification');
    return;
  }
  
  // Handle notification click (open action or general click)
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      console.log('Found clients:', clientList.length);
      
      // If a window is already open, focus it instead of opening new one
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

/**
 * Notification close event handler
 * Triggered when a notification is dismissed by the user
 * @param {NotificationEvent} event - The notification close event
 */
self.addEventListener('notificationclose', (event) => {
  console.log('Notification closed:', event);
  // Could track notification dismissal analytics here
});

/**
 * Push subscription change event handler
 * Triggered when the push subscription is invalidated or changed
 * @param {PushSubscriptionChangeEvent} event - The subscription change event
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('Push subscription changed:', event);
  // Handle subscription change if needed - could re-subscribe here
  // This would typically involve re-registering with the server
});