const subscribeButton = document.getElementById('subscribe');
const checkPermissionsButton = document.getElementById('checkPermissions');
const checkSubscriptionsButton = document.getElementById('checkSubscriptions');
const testNotificationButton = document.getElementById('testNotification');

const VAPID_PUBLIC_KEY = 'BGqrNPCHC4zRpHFbg1SNh_0Zqj4ePCiuISgVVSzAY0SzZF7vWDpz0lzeP67-Huj_iDg569tvG-eHcKFtbyUZU4g';

const apiUrl = 'http://localhost:3003';
const subscribeEndpoint = `${apiUrl}/subscribe`;
const subscriptionsEndpoint = `${apiUrl}/subscriptions`;
const notificationEndpoint = `${apiUrl}/send-notification`;

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

const messageElement = document.getElementById('message');

const displayMessage = (text, isError = false) => {
  console.log(`Display Message: ${text} (Error: ${isError})`);
  messageElement.textContent = text;
  messageElement.className = isError ? 'error' : 'success';
};

const updateDebugInfo = () => {
  const swSupport = document.getElementById('swSupport');
  const pmSupport = document.getElementById('pmSupport');
  const notifPermission = document.getElementById('notifPermission');
  const swRegistered = document.getElementById('swRegistered');

  if (swSupport) swSupport.textContent = ('serviceWorker' in navigator) ? 'Yes' : 'No';
  if (pmSupport) pmSupport.textContent = ('PushManager' in window) ? 'Yes' : 'No';
  if (notifPermission) notifPermission.textContent = Notification.permission;
  
  if (swRegistered) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      swRegistered.textContent = registrations.length > 0 ? `${registrations.length} worker(s)` : 'None';
    }).catch(() => {
      swRegistered.textContent = 'Error checking';
    });
  }
};

const checkNotificationPermission = () => {
  console.log('Checking notification permission...');
  const permission = Notification.permission;
  console.log('Current notification permission:', permission);
  
  updateDebugInfo();
  
  if (permission === 'denied') {
    displayMessage('Notifications are blocked. Click the lock icon next to the URL to enable them.', true);
  } else if (permission === 'default') {
    displayMessage('Ready to subscribe. Click Subscribe to enable notifications.', false);
  } else if (permission === 'granted') {
    displayMessage('Notifications are enabled. You can subscribe to push notifications.', false);
  }
  
  return permission;
};

const subscribe = async () => {
  console.log('Subscribe button clicked');
  displayMessage('Starting subscription process...', false);
  
  if (!('serviceWorker' in navigator)) {
    displayMessage('Service Workers are not supported in this browser.', true);
    return;
  }

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
    
    // Get push manager subscription
    console.log('Creating push subscription...');
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    
    console.log('Push subscription created:', subscription);
    displayMessage('Push subscription created. Sending to server...', false);

    // Send subscription to server
    console.log('Sending subscription to server...');
    const response = await fetch(subscribeEndpoint, {
      method: 'POST',
      body: JSON.stringify(subscription),
      headers: {
        'Content-Type': 'application/json',
      },
    });

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
    subscribeButton.disabled = false;
  }
};

const checkSubscriptions = async () => {
  console.log('Checking subscriptions...');
  try {
    const response = await fetch(subscriptionsEndpoint);
    const subscriptions = await response.json();
    console.log('Current subscriptions:', subscriptions);
    
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

const sendTestNotification = async () => {
  console.log('Sending test notification...');
  try {
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

const checkForServiceWorkers = async () => {
  console.log('Checking for existing service workers...');
  
  if (!('serviceWorker' in navigator)) {
    console.warn(
      '%cService workers are not supported in this browser.',
      'color: gray; font-style: italic;',
    );
    return;
  }

  try {
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

// Event listeners
subscribeButton.addEventListener('click', subscribe);
checkPermissionsButton.addEventListener('click', checkNotificationPermission);
checkSubscriptionsButton.addEventListener('click', checkSubscriptions);
testNotificationButton.addEventListener('click', sendTestNotification);

// Check for service workers on page load
document.addEventListener('DOMContentLoaded', () => {
  console.log('Page loaded, checking for service workers...');
  checkForServiceWorkers();
  checkNotificationPermission();
  updateDebugInfo();
});

// Also run the check immediately in case DOMContentLoaded already fired
checkForServiceWorkers();
checkNotificationPermission();
updateDebugInfo();