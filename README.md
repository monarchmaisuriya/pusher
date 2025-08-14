# Pusher

A simple push notification system using Node.js, Express, Redis, and web-push.

## Features

- **Web Push Notifications:** Utilizes the `web-push` library to send notifications to modern web browsers.
- **Subscription Persistence:** Stores client push subscriptions in a Redis database.
- **Simple REST API:** Exposes endpoints to subscribe clients and trigger notifications.
- **Frontend Client:** A basic HTML/JS client to subscribe to notifications and test the system.
- **CORS Support:** Configured to allow requests from the client's origin.

## Project Structure

The project is divided into two main directories:

### `/server` Directory
Contains the backend Node.js application that handles push notification management:
- **`src/server.js`**: Main Express server with REST API endpoints
- **`package.json`**: Node.js dependencies including express, redis, web-push, and cors
- **Features**:
  - REST API for subscription management and notification sending
  - Redis integration for persistent subscription storage
  - VAPID key configuration for web push notifications
  - CORS support for cross-origin requests from the client
  - Health check and cleanup endpoints

### `/client` Directory
Contains the frontend web application for user interaction:
- **`index.html`**: Main HTML page with notification controls and status display
- **`main.js`**: Client-side JavaScript handling subscription management and API communication
- **`service-worker.js`**: Service worker for receiving and displaying push notifications
- **Features**:
  - Browser notification permission handling
  - Push subscription creation and management
  - Real-time notification testing interface
  - Debug information and subscription status display

## Prerequisites

- Node.js and npm
- Redis (must be running on the default port `6379`)

## Setup

### 1. Server Setup

First, navigate to the server directory, install dependencies, and start the server.

```bash
# Navigate to the server directory
cd pusher/server

# Install dependencies
npm install

# Start the server
npm start
```

The server will start on `http://localhost:3003`.

### 2. Client Setup

In a separate terminal, serve the client-side files using a simple HTTP server. We recommend using `npx http-server` for easy setup:

```bash
# Navigate to the client directory
cd pusher/client

# Serve the client files using npx http-server
npx http-server
```

This will typically serve the client on `http://localhost:8080`. The `npx http-server` command:
- Serves static files from the current directory
- Automatically opens your default browser (optional)
- Provides CORS headers needed for the push notification API
- No installation required - runs directly via npx

## Usage

### Getting Started

1. **Start Both Services**: Ensure both the server (port 3003) and client (port 8080) are running as described in the Setup section.

2. **Open the Client**: Navigate to `http://localhost:8080` in your web browser.

### Client Interface Features

#### 1. **Subscribe to Notifications**
- Click the **"Subscribe"** button
- Your browser will prompt for notification permission - click "Allow"
- This registers your browser with the server to receive push notifications
- The page will display your subscription status and browser support information

#### 2. **Check Notification Permissions**
- Click **"Check Permissions"** to verify your browser's notification settings
- Shows current permission status (granted, denied, or default)
- Displays browser compatibility information

#### 3. **View Active Subscriptions**
- Click **"Check Subscriptions"** to see all registered clients
- Displays the total number of active subscriptions
- Full subscription details are logged in the browser console (F12)

#### 4. **Send Test Notifications**
- Click **"Send Test Notification"** to trigger a notification to all subscribed clients
- The notification will appear even if the browser tab is not active
- Useful for testing the complete notification flow

### API Testing with curl

You can also interact with the server directly using curl commands:

#### Send Notification to All Subscribers
```bash
curl -X POST -H "Content-Type: application/json" \
     -d '{"title": "Hello from curl!", "body": "This is a custom notification."}' \
     http://localhost:3003/send-notification
```

#### Check All Subscriptions
```bash
curl http://localhost:3003/subscriptions
```

#### Health Check
```bash
curl http://localhost:3003/health
```

#### Send Notification to Specific Client
```bash
# First get subscription ID from /subscriptions endpoint
curl -X POST -H "Content-Type: application/json" \
     -d '{"title": "Personal Message", "body": "This is for you!"}' \
     http://localhost:3003/send-notification/SUBSCRIPTION_ID
```

### Troubleshooting

- **No notifications appearing**: Check browser permissions and ensure the service worker is registered
- **CORS errors**: Make sure both server and client are running on their respective ports
- **Redis connection issues**: Verify Redis is running on the default port 6379
- **Service worker issues**: Check the browser console for registration errors

## API Endpoints

- `GET /`: A simple welcome message.
- `GET /health`: A health check endpoint to verify server and Redis status.
- `POST /subscribe`: Saves a new push subscription. The client sends this automatically.
- `GET /subscriptions`: Returns a JSON array of all active subscriptions.
- `POST /send-notification`: Triggers a push notification to all subscribed clients. Accepts an optional JSON body with `title`, `body`, and `icon`.
- `GET /subscriptions/:id`: Returns the subscription details for a specific client. The `:id` is the client's subscription ID.
- `POST /send-notification/:id`: Triggers a push notification to a specific client. The `:id` is the client's subscription ID.
- `DELETE /unsubscribe/:id`: Unsubscribes a client. The `:id` is the client's subscription ID.

## Configuration

The VAPID keys for `web-push` are hardcoded in `pusher/server/src/server.js`. For a real application, these should be stored securely as environment variables.
