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

- `/server`: This directory contains the backend application built with Node.js and Express. It is responsible for:
  - Exposing a REST API.
  - Saving push notification subscriptions to a Redis database.
  - Sending push notifications to registered clients when triggered by an API call.
- `/client`: This directory contains the static frontend files (HTML, JavaScript, and CSS). This is the web page that users interact with. It handles:
  - Requesting permission from the user to show notifications.
  - Creating a push subscription and sending it to the server to be stored.
  - Providing buttons to test the notification system.

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

In a separate terminal, serve the client-side files using a simple live server. The `npx http-server` command is a straightforward way to do this.

```bash
# Navigate to the client directory
cd pusher/client

# Serve the client files
npx http-server
```

This will typically serve the client on `http://localhost:8080`.

## Usage

1.  **Open the Client:** Open your web browser and navigate to the client URL provided by the `http-server` (e.g., `http://localhost:8080`).

2.  **Subscribe:** Click the **"Subscribe"** button. Your browser will prompt you for permission to show notifications. Click "Allow". This action registers your browser with the server to receive push notifications.

3.  **Send a Test Notification:** You can trigger a test notification in two ways:

    - **From the Client:** Click the **"Send Test Notification"** button. The server will immediately send a notification to all subscribed clients, including yours.
    - **Using `curl`:** You can trigger a notification directly via the API from your command line:
      ```bash
      curl -X POST -H "Content-Type: application/json" \
           -d '{"title": "Hello from curl!", "body": "This is a custom notification."}' \
           http://localhost:3003/send-notification
      ```

4.  **Check Subscriptions:** You can see how many clients are currently subscribed:
    - **From the Client:** Click the **"Check Subscriptions"** button. The number of active subscriptions will be displayed on the page, and the full subscription details will be logged in the browser's developer console.
    - **Using `curl`:**
      ```bash
      curl http://localhost:3003/subscriptions
      ```

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
