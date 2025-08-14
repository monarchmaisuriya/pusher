/**
 * Push Notification Client Application
 * Handles push notification subscription, permission management, and testing
 * @file main.js
 * @description This client-side application manages push notification subscriptions,
 * handles user permissions, and provides testing functionality for the push notification system
 */

// DOM element references for UI interaction
const subscribeButton = document.getElementById('subscribe');
const checkPermissionsButton = document.getElementById('checkPermissions');
const checkSubscriptionsButton = document.getElementById('checkSubscriptions');
const testNotificationButton = document.getElementById('testNotification');

// VAPID public key for push subscription (must match server's public key)
const VAPID_PUBLIC_KEY = 'BGqrNPCHC4zRpHFbg1SNh_0Zqj4ePCiuISgVVSzAY0SzZF7vWDpz0lzeP67-Huj_iDg569tvG-eHcKFtbyUZU4g';

// API endpoints for server communication
const apiUrl = 'http://localhost:3003';
const subscribeEndpoint = `${apiUrl}/subscribe`;
const subscriptionsEndpoint = `${apiUrl}/subscriptions`;
const notificationEndpoint = `${apiUrl}/send-notification`;

/**
 * Converts a URL-safe base64 string to Uint8Array
 * Required for VAPID key conversion in push subscription
 * @param {string} base64String - The base64 encoded string to convert
 * @returns {Uint8Array} The converted byte array
 */
const urlBase64ToUint8Array = (base64String) => {
  // Add padding if needed for proper base64 decoding
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  // Convert URL-safe base64 to standard base64
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  // Decode base64 to binary string
  const rawData = window.atob(base64);
  // Convert binary string to Uint8Array
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

// Message display element for user feedback
const messageElement = document.getElementById('message');

/**
 * Displays a message to the user with appropriate styling
 * @param {string} text - The message text to display
 * @param {boolean} isError - Whether this is an error message (affects styling)
 */
const displayMessage = (text, isError = false) => {
  console.log(`Display Message: ${text} (Error: ${isError})`);
  messageElement.textContent = text;
  messageElement.className = isError ? 'error' : 'success';
};

/**
 * Updates the debug information display on the page
 * Shows browser support status for various push notification features
 */
const updateDebugInfo = () => {
  const swSupport = document.getElementById('swSupport');
  const pmSupport = document.getElementById('pmSupport');
  const notifPermission = document.getElementById('notifPermission');
  const swRegistered = document.getElementById('swRegistered');

  // Check and display Service Worker support
  if (swSupport) swSupport.textContent = ('serviceWorker' in navigator) ? 'Yes' : 'No';
  // Check and display Push Manager support
  if (pmSupport) pmSupport.textContent = ('PushManager' in window) ? 'Yes' : 'No';
  // Display current notification permission status
  if (notifPermission) notifPermission.textContent = Notification.permission;
  
  // Check and display registered service workers
  if (swRegistered) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      swRegistered.textContent = registrations.length > 0 ? `${registrations.length} worker(s)` : 'None';
    }).catch(() => {
      swRegistered.textContent = 'Error checking';
    });
  }
};

/**
 * Checks the current notification permission status and updates the UI
 * @returns {string} The current notification permission ('granted', 'denied', or 'default')
 */
const checkNotificationPermission = () => {
  console.log('Checking notification permission...');
  const permission = Notification.permission;
  console.log('Current notification permission:', permission);
  
  // Update debug information display
  updateDebugInfo();
  
  // Display appropriate message based on permission status
  if (permission === 'denied') {
    displayMessage('Notifications are blocked. Click the lock icon next to the URL to enable them.', true);
  } else if (permission === 'default') {
    displayMessage('Ready to subscribe. Click Subscribe to enable notifications.', false);
  } else if (permission === 'granted') {
    displayMessage('Notifications are enabled. You can subscribe to push notifications.', false);
  }
  
  return permission;
};

/**
 * Subscribes the user to push notifications
 * Handles service worker registration, permission requests, and server communication
 * @async
 * @returns {Promise<void>}
 */
const subscribe = async () => {
  console.log('Subscribe button clicked');
  displayMessage('Starting subscription process...', false);
  
  // Check for Service Worker support
  if (!('serviceWorker' in navigator)) {
    displayMessage('Service Workers are not supported in this browser.', true);
    return;
  }

  // Check for Push Manager support
  if (!('PushManager' in window)) {
    displayMessage('Push messaging is not supported in this browser.', true);
    return;
  }

  // Check and request notification permission
  console.log('Current notification permission:', Notification.permission);
  
  if (Notification.permission === 'denied') {
    displayMessage('Notifications are blocked. Please enable them in browser settings.', true);
    console.log('Notifications are permanently blocked. User needs to reset permissions manually.');
    return;
  }

  // Request permission if not already granted
  if (Notification.permission !== 'granted') {
    console.log('Requesting notification permission...');
    displayMessage('Requesting notification permission...', false);
    
    const permission = await Notification.requestPermission();
    console.log('Permission result:', permission);
    
    if (permission !== 'granted') {
      displayMessage('Notification permission denied. Please enable notifications to subscribe.', true);
      return;
    }
  }

  try {
    // Disable button to prevent multiple subscriptions
    subscribeButton.disabled = true;
    
    // Register service worker
    console.log('Registering service worker...');
    const registration = await navigator.serviceWorker.register('./service-worker.js', {
      scope: './'
    });
    console.log('Service Worker registered:', registration);
    
    // Wait for service worker to be ready
    console.log('Waiting for service worker to be ready...');
    await navigator.serviceWorker.ready;
    console.log('Service Worker is ready');
    
    // Create push subscription with VAPID key
    console.log('Creating push subscription...');
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true, // Required for Chrome
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    
    console.log('Push subscription created:', subscription);
    displayMessage('Push subscription created. Sending to server...', false);

    // Send subscription to server for storage
    console.log('Sending subscription to server...');
    const response = await fetch(subscribeEndpoint, {
      method: 'POST',
      body: JSON.stringify(subscription),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Check server response
    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }

    const result = await response.json();
    console.log('Server response:', result);
    displayMessage(`Successfully subscribed! ID: ${result.id}. Expires: ${new Date(result.expiresAt).toLocaleDateString()}`, false);
    
  } catch (error) {
    console.error('Subscription error:', error);
    displayMessage(`Error: ${error.message}`, true);
  } finally {
    // Re-enable button regardless of success or failure
    subscribeButton.disabled = false;
  }
};

/**
 * Fetches and displays all active subscriptions from the server
 * @async
 * @returns {Promise<void>}
 */
const checkSubscriptions = async () => {
  console.log('Checking subscriptions...');
  try {
    // Fetch subscriptions from server
    const response = await fetch(subscriptionsEndpoint);
    const subscriptions = await response.json();
    console.log('Current subscriptions:', subscriptions);
    
    // Display subscription details in console table format
    if (subscriptions.length > 0) {
      console.table(subscriptions.map(sub => ({
        id: sub.id,
        createdAt: new Date(sub.createdAt).toLocaleString(),
        expiresAt: new Date(sub.expiresAt).toLocaleString(),
        endpoint: sub.subscription.endpoint.substring(0, 50) + '...'
      })));
    }
    
    displayMessage(`Found ${subscriptions.length} active subscription(s). Check console for details.`, false);
  } catch (error) {
    console.error('Error checking subscriptions:', error);
    displayMessage(`Error checking subscriptions: ${error.message}`, true);
  }
};

/**
 * Sends a test notification to all active subscriptions
 * @async
 * @returns {Promise<void>}
 */
const sendTestNotification = async () => {
  console.log('Sending test notification...');
  try {
    // Send test notification to server
    const response = await fetch(notificationEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Test Notification',
        body: 'This is a test notification from your app!',
        icon: '/icon.png'
      }),
    });

    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }

    const result = await response.json();
    console.log('Notification sent:', result);
    displayMessage('Test notification sent successfully!', false);
  } catch (error) {
    console.error('Error sending notification:', error);
    displayMessage(`Error sending notification: ${error.message}`, true);
  }
};

/**
 * Checks for existing service worker registrations and logs detailed information
 * Used for debugging and development purposes
 * @async
 * @returns {Promise<void>}
 */
const checkForServiceWorkers = async () => {
  console.log('Checking for existing service workers...');
  
  // Check if service workers are supported
  if (!('serviceWorker' in navigator)) {
    console.warn(
      '%cService workers are not supported in this browser.',
      'color: gray; font-style: italic;',
    );
    return;
  }

  try {
    // Get all registered service workers
    const registrations = await navigator.serviceWorker.getRegistrations();
    
    if (registrations.length === 0) {
      console.log(
        '%cNo service workers registered.',
        'color: orange; font-weight: bold;',
      );
    } else {
      console.log(
        `%c${registrations.length} service worker(s) registered:`,
        'color: green; font-weight: bold;',
      );
      // Log details for each registered service worker
      registrations.forEach((registration, index) => {
        const activeWorker = registration.active;
        console.group(`Service Worker #${index + 1}`);
        console.log('Scope:', registration.scope);
        console.log('Script URL:', activeWorker?.scriptURL || 'Not active');
        console.log('State:', activeWorker?.state || 'Not active');
        console.groupEnd();
      });
    }
  } catch (error) {
    console.error(
      '%cError fetching service workers:',
      'color: red; font-weight: bold;',
      error,
    );
  }
};

// Event listeners for UI buttons
subscribeButton.addEventListener('click', subscribe);
checkPermissionsButton.addEventListener('click', checkNotificationPermission);
checkSubscriptionsButton.addEventListener('click', checkSubscriptions);
testNotificationButton.addEventListener('click', sendTestNotification);

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('Page loaded, checking for service workers...');
  checkForServiceWorkers();
  checkNotificationPermission();
  updateDebugInfo();
});

// Run initial checks and setup
checkForServiceWorkers(); // Debug: Check existing service workers
checkNotificationPermission(); // Check current permission status
updateDebugInfo(); // Update browser support information