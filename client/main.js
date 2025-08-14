const subscribeButton = document.getElementById('subscribe');
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
    displayMessage('Successfully subscribed to push notifications!', false);
    
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
    displayMessage(`Found ${subscriptions.length} subscription(s). Check console for details.`, false);
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
checkSubscriptionsButton.addEventListener('click', checkSubscriptions);
testNotificationButton.addEventListener('click', sendTestNotification);

// Check for service workers on page load
document.addEventListener('DOMContentLoaded', () => {
  console.log('Page loaded, checking for service workers...');
  checkForServiceWorkers();
});

// Also run the check immediately in case DOMContentLoaded already fired
checkForServiceWorkers();