# Pusher

A simple push notification system using Node.js, Express, Redis, and web-push.

## Prerequisites

- Node.js
- npm
- Redis

## Setup

1.  **Install Redis and have it running on the default port.**

2.  **Install server dependencies:**

    ```bash
    cd /Users/monarchmaisuriya/Personal/pusher/server
    npm install
    ```

3.  **Start the server:**

    ```bash
    npm start
    ```

4.  **Serve the client files.** A simple way to do this is to use a simple HTTP server. For example, you can use the `http-server` package from npm:

    ```bash
    npx http-server ./client
    ```

5.  **Open the client in your browser** (e.g., `http://localhost:8080`).

6.  **Click the "Subscribe" button** to register for push notifications.

7.  **Send a notification** by making a POST request to `http://localhost:3003/send-notification`. You can use a tool like `curl` for this:

    ```bash
    curl -X POST http://localhost:3003/send-notification
    ```
