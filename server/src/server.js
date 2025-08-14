/**
 * Push Notification Server
 * 
 * A Node.js Express server that handles web push notifications using the Web Push Protocol.
 * Features include subscription management, notification sending, and Redis-based storage.
 * 
 * @author Monarch Maisuriya
 * @version 1.0.0
 */

import express from "express"
import bodyParser from "body-parser"
import webpush from "web-push"
import redis from "redis"
import cors from "cors"
import morgan from "morgan"
import { v4 as uuidv4 } from "uuid"

// Server configuration
const port = 3003
const app = express()

/**
 * Express middleware configuration
 * Sets up CORS, logging, and JSON parsing
 */

// Enable CORS for specified origins (development environments)
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:8080', 'http://127.0.0.1:8080'],
  credentials: true // Allow cookies and credentials
}))

// HTTP request logging middleware
app.use(morgan("dev"))

// Parse JSON request bodies
app.use(bodyParser.json())

/**
 * Redis client configuration
 * Used for storing push notification subscriptions with automatic retry logic
 */
const redisClient = redis.createClient({
  host: 'localhost',
  port: 6379,
  // Retry strategy for handling connection failures
  retry_strategy: (options) => {
    // Log connection refusal errors
    if (options.error && options.error.code === 'ECONNREFUSED') {
      console.log('Redis server refused connection. Retrying...')
    }
    // Stop retrying after 1 hour
    if (options.total_retry_time > 1000 * 60 * 60) {
      return new Error('Retry time exhausted')
    }
    // Stop retrying after 10 attempts
    if (options.attempt > 10) {
      return undefined
    }
    // Exponential backoff with max 3 second delay
    return Math.min(options.attempt * 100, 3000)
  }
})

// Redis event handlers
redisClient.on("error", (err) => {
  console.log("Redis Client Error:", err.message)
})

redisClient.on("connect", () => {
  console.log("Connected to Redis!")
})

/**
 * Establishes connection to Redis with automatic retry on failure
 * @async
 * @function connectRedis
 * @returns {Promise<void>}
 */
async function connectRedis() {
  try {
    await redisClient.connect()
    console.log("Redis connection established!")
  } catch (err) {
    console.error("Redis connection error:", err.message)
    console.log("Attempting to reconnect to Redis in 5 seconds...")
    // Retry connection after 5 seconds
    setTimeout(connectRedis, 5000)
  }
}

/**
 * Utility functions for subscription management
 */

/**
 * Generates a unique subscription ID using UUID v4
 * @function generateSubscriptionId
 * @returns {string} A unique subscription identifier
 */
const generateSubscriptionId = () => {
  return uuidv4()
}

/**
 * Creates a subscription object with metadata and expiration
 * @function createSubscriptionObject
 * @param {Object} subscriptionData - The push subscription data from the client
 * @param {string} subscriptionData.endpoint - The push service endpoint URL
 * @param {Object} subscriptionData.keys - The encryption keys (p256dh and auth)
 * @returns {Object} Complete subscription object with ID, timestamps, and expiration
 */
const createSubscriptionObject = (subscriptionData) => {
  const now = new Date()
  const expiryDate = new Date(now.getTime() + (365 * 24 * 60 * 60 * 1000)) // 365 days from now
  
  return {
    id: generateSubscriptionId(),
    subscription: subscriptionData,
    createdAt: now.toISOString(),
    expiresAt: expiryDate.toISOString(),
    isActive: true
  }
}

/**
 * Checks if a subscription has expired
 * @function isSubscriptionExpired
 * @param {Object} subscriptionObj - The subscription object to check
 * @param {string} subscriptionObj.expiresAt - ISO string of expiration date
 * @returns {boolean} True if the subscription has expired
 */
const isSubscriptionExpired = (subscriptionObj) => {
  return new Date() > new Date(subscriptionObj.expiresAt)
}

// Initialize Redis connection
connectRedis()

/**
 * VAPID (Voluntary Application Server Identification) keys configuration
 * These keys are used to identify the application server to push services
 * @constant {Object} vapidKeys
 * @property {string} publicKey - Public key for client-side subscription
 * @property {string} privateKey - Private key for server-side authentication
 */
const vapidKeys = {
  publicKey: "BGqrNPCHC4zRpHFbg1SNh_0Zqj4ePCiuISgVVSzAY0SzZF7vWDpz0lzeP67-Huj_iDg569tvG-eHcKFtbyUZU4g",
  privateKey: "LkTN9xnaU7BKKhw-T1NATTrQsIJ3xN5AVzipL0zDBdY",
}

// Configure web-push library with VAPID details
webpush.setVapidDetails(
  "mailto:your-email@example.com", // Contact email for push service
  vapidKeys.publicKey,
  vapidKeys.privateKey
)

/**
 * API Routes
 */

/**
 * Root endpoint - Health check for the server
 * @route GET /
 * @returns {Object} 200 - Server status message
 */
app.get("/", (req, res) => {
  res.json({ message: "Push notification server is running!" })
})

/**
 * Get all active subscriptions
 * Automatically removes expired subscriptions during retrieval
 * @route GET /subscriptions
 * @returns {Array} 200 - Array of active subscription objects
 * @returns {Object} 500 - Error message if operation fails
 */
app.get("/subscriptions", async (req, res) => {
  try {
    console.log('Fetching all subscriptions from Redis...')
    
    // Ensure Redis connection is active
    if (!redisClient.isOpen) {
      throw new Error('Redis client is not connected')
    }
    
    // Get all subscription keys from Redis
    const subscriptionKeys = await redisClient.keys("subscription:*")
    console.log(`Found ${subscriptionKeys.length} subscription keys in Redis`)
    
    if (subscriptionKeys.length === 0) {
      return res.json([])
    }

    // Retrieve all subscription data
    const subscriptions = await redisClient.mGet(subscriptionKeys)
    const parsedSubscriptions = subscriptions.map((sub, index) => {
      try {
        const parsed = JSON.parse(sub)
        // Check if subscription is expired
        if (isSubscriptionExpired(parsed)) {
          console.log(`Subscription ${parsed.id} is expired, marking for cleanup`)
          // Remove expired subscription asynchronously
          redisClient.del(subscriptionKeys[index]).catch(err => 
            console.error('Error deleting expired subscription:', err)
          )
          return null
        }
        return parsed
      } catch (error) {
        console.error('Error parsing subscription:', error)
        return null
      }
    }).filter(Boolean) // Remove null entries
    
    console.log(`Returning ${parsedSubscriptions.length} active subscriptions`)
    res.json(parsedSubscriptions)
  } catch (error) {
    console.error('Error fetching subscriptions:', error.message)
    res.status(500).json({ error: 'Failed to fetch subscriptions', details: error.message })
  }
})

/**
 * Get a specific subscription by ID
 * Automatically removes the subscription if it has expired
 * @route GET /subscriptions/:id
 * @param {string} id - The subscription ID
 * @returns {Object} 200 - The subscription object
 * @returns {Object} 404 - Subscription not found or expired
 * @returns {Object} 500 - Error message if operation fails
 */
app.get("/subscriptions/:id", async (req, res) => {
  try {
    const { id } = req.params
    console.log(`Fetching subscription with ID: ${id}`)
    
    // Ensure Redis connection is active
    if (!redisClient.isOpen) {
      throw new Error('Redis client is not connected')
    }
    
    // Retrieve subscription data from Redis
    const subscriptionData = await redisClient.get(`subscription:${id}`)
    
    if (!subscriptionData) {
      return res.status(404).json({ error: 'Subscription not found' })
    }
    
    const subscription = JSON.parse(subscriptionData)
    
    // Check if subscription is expired and remove if so
    if (isSubscriptionExpired(subscription)) {
      console.log(`Subscription ${id} is expired, removing it`)
      await redisClient.del(`subscription:${id}`)
      return res.status(404).json({ error: 'Subscription not found or expired' })
    }
    
    console.log(`Found subscription: ${id}`)
    res.json(subscription)
  } catch (error) {
    console.error('Error fetching subscription:', error.message)
    res.status(500).json({ error: 'Failed to fetch subscription', details: error.message })
  }
})

/**
 * Delete a subscription (unsubscribe)
 * @route DELETE /unsubscribe/:id
 * @param {string} id - The subscription ID to delete
 * @returns {Object} 200 - Success message with deleted subscription ID
 * @returns {Object} 404 - Subscription not found
 * @returns {Object} 500 - Error message if operation fails
 */
app.delete("/unsubscribe/:id", async (req, res) => {
  try {
    const { id } = req.params
    console.log(`Deleting subscription with ID: ${id}`)
    
    // Ensure Redis connection is active
    if (!redisClient.isOpen) {
      throw new Error('Redis client is not connected')
    }
    
    // Delete the subscription from Redis
    const result = await redisClient.del(`subscription:${id}`)
    
    // Check if the subscription existed
    if (result === 0) {
      return res.status(404).json({ error: 'Subscription not found' })
    }
    
    console.log(`Subscription ${id} deleted successfully`)
    res.json({ message: 'Subscription deleted successfully', id })
  } catch (error) {
    console.error('Error deleting subscription:', error.message)
    res.status(500).json({ error: 'Failed to delete subscription', details: error.message })
  }
})

/**
 * Create a new push notification subscription
 * Stores the subscription in Redis with metadata and automatic expiration
 * @route POST /subscribe
 * @param {Object} req.body - The subscription data from the client
 * @param {string} req.body.endpoint - The push service endpoint URL
 * @param {Object} req.body.keys - Encryption keys (p256dh and auth)
 * @param {string} req.body.keys.p256dh - Public key for encryption
 * @param {string} req.body.keys.auth - Authentication secret
 * @returns {Object} 201 - Success response with subscription details
 * @returns {Object} 400 - Invalid subscription data
 * @returns {Object} 500 - Error message if operation fails
 */
app.post("/subscribe", async (req, res) => {
  try {
    const subscriptionData = req.body;
    console.log('Received subscription request');
    console.log('Subscription endpoint:', subscriptionData.endpoint);
    console.log('Keys present:', !!subscriptionData.keys);

    // Validate required subscription data
    if (!subscriptionData || !subscriptionData.endpoint || !subscriptionData.keys) {
      return res.status(400).json({ error: 'Invalid subscription data' });
    }

    // Ensure Redis connection is active
    if (!redisClient.isOpen) {
      throw new Error('Redis client is not connected');
    }

    // Capture subscriber metadata for analytics and debugging
    const userAgent = req.get('User-Agent') || 'Unknown';
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'Unknown';

    // Create subscription object with ID, expiry, and metadata
    const subscriptionObj = {
      ...createSubscriptionObject(subscriptionData),
      userAgent,
      ipAddress
    };

    const subscriptionString = JSON.stringify(subscriptionObj);

    // Store subscription in Redis with unique ID as key
    await redisClient.set(`subscription:${subscriptionObj.id}`, subscriptionString);

    // Set TTL for automatic cleanup (365 days)
    await redisClient.expire(`subscription:${subscriptionObj.id}`, 365 * 24 * 60 * 60);

    console.log(`Subscription saved to Redis with ID: ${subscriptionObj.id}`);
    console.log(`User-Agent: ${userAgent}`);
    console.log(`IP Address: ${ipAddress}`);

    // Get total count of subscriptions for analytics
    const allKeys = await redisClient.keys("subscription:*");
    console.log(`Total subscriptions in Redis: ${allKeys.length}`);

    res.status(201).json({
      message: 'Subscription added successfully',
      id: subscriptionObj.id,
      expiresAt: subscriptionObj.expiresAt,
      userAgent,
      ipAddress,
      totalSubscriptions: allKeys.length
    });
  } catch (error) {
    console.error('Error saving subscription:', error.message);
    res.status(500).json({ error: 'Failed to save subscription', details: error.message });
  }
});


/**
 * Send push notification to all active subscriptions
 * Automatically removes expired subscriptions during the process
 * @route POST /send-notification
 * @param {Object} req.body - Notification content
 * @param {string} [req.body.title="New Notification"] - Notification title
 * @param {string} [req.body.body="This is a new notification"] - Notification body text
 * @param {string} [req.body.icon="/icon.png"] - Notification icon URL
 * @returns {Object} 200 - Success response with delivery statistics
 * @returns {Object} 404 - No subscriptions found
 * @returns {Object} 500 - Error message if operation fails
 */
app.post("/send-notification", async (req, res) => {
  try {
    const { title, body, icon } = req.body
    console.log('Received send-notification request')
    console.log('Notification data:', { title, body, icon })
    
    // Create notification payload with defaults
    const notificationPayload = {
      notification: {
        title: title || "New Notification",
        body: body || "This is a new notification",
        icon: icon || "/icon.png",
      },
    }

    console.log('Fetching subscriptions from Redis...')
    
    // Ensure Redis connection is active
    if (!redisClient.isOpen) {
      throw new Error('Redis client is not connected')
    }
    
    // Get all subscription keys
    const subscriptionKeys = await redisClient.keys("subscription:*")
    console.log(`Found ${subscriptionKeys.length} subscription keys`)
    
    if (subscriptionKeys.length === 0) {
      console.log('No subscriptions found in Redis')
      return res.status(404).json({ error: 'No subscriptions found' })
    }

    // Retrieve all subscription data
    const subscriptions = await redisClient.mGet(subscriptionKeys)
    console.log('Sending notifications to all active subscriptions...')
    
    const results = []
    let activeSubscriptions = 0
    
    // Process each subscription
    for (let i = 0; i < subscriptions.length; i++) {
      try {
        const subscriptionObj = JSON.parse(subscriptions[i])
        
        // Check if subscription is expired and remove if so
        if (isSubscriptionExpired(subscriptionObj)) {
          console.log(`Subscription ${subscriptionObj.id} is expired, skipping and removing`)
          await redisClient.del(subscriptionKeys[i])
          results.push({ success: false, id: subscriptionObj.id, error: 'Subscription expired' })
          continue
        }

        activeSubscriptions++
        console.log(`Sending notification ${activeSubscriptions}/${subscriptionKeys.length} to subscription ${subscriptionObj.id}`)
        
        // Send push notification using web-push library
        await webpush.sendNotification(
          subscriptionObj.subscription,
          JSON.stringify(notificationPayload)
        )
        
        results.push({ success: true, id: subscriptionObj.id })
        console.log(`Notification sent successfully to subscription ${subscriptionObj.id}`)
      } catch (error) {
        const subscriptionObj = subscriptions[i] ? JSON.parse(subscriptions[i]) : { id: 'unknown' }
        console.error(`Failed to send notification to subscription ${subscriptionObj.id}:`, error.message)
        results.push({ success: false, id: subscriptionObj.id, error: error.message })
        
        // Remove invalid subscriptions (HTTP 410 Gone or 404 Not Found)
        if (error.statusCode === 410 || error.statusCode === 404) {
          console.log(`Removing invalid subscription ${subscriptionObj.id}`)
          await redisClient.del(subscriptionKeys[i])
        }
      }
    }

    // Calculate delivery statistics
    const successCount = results.filter(r => r.success).length
    const failureCount = results.filter(r => !r.success).length
    
    console.log(`Notification sending complete. Success: ${successCount}, Failures: ${failureCount}`)
    
    // Return comprehensive delivery report
    res.status(200).json({ 
      message: "Notification sending completed",
      successful: successCount,
      failed: failureCount,
      totalProcessed: subscriptionKeys.length,
      activeSubscriptions: activeSubscriptions,
      results: results
    })
  } catch (error) {
    console.error('Error sending notifications:', error.message)
    res.status(500).json({ error: 'Failed to send notifications', details: error.message })
  }
})

/**
 * Send push notification to a specific subscription
 * @route POST /send-notification/:id
 * @param {string} id - The subscription ID to send notification to
 * @param {Object} req.body - Notification content
 * @param {string} [req.body.title="New Notification"] - Notification title
 * @param {string} [req.body.body="This is a new notification"] - Notification body text
 * @param {string} [req.body.icon="/icon.png"] - Notification icon URL
 * @returns {Object} 200 - Success response
 * @returns {Object} 404 - Subscription not found or expired
 * @returns {Object} 500 - Error message if operation fails
 */
app.post("/send-notification/:id", async (req, res) => {
  try {
    const { id } = req.params
    const { title, body, icon } = req.body

    console.log(`Received request to send notification to subscription ${id}`)

    // Ensure Redis connection is active
    if (!redisClient.isOpen) {
      throw new Error('Redis client is not connected')
    }

    // Retrieve specific subscription from Redis
    const subscriptionData = await redisClient.get(`subscription:${id}`)
    if (!subscriptionData) {
      return res.status(404).json({ error: 'Subscription not found' })
    }

    const subscriptionObj = JSON.parse(subscriptionData)

    // Check if subscription has expired and remove if so
    if (isSubscriptionExpired(subscriptionObj)) {
      console.log(`Subscription ${id} is expired, removing it`)
      await redisClient.del(`subscription:${id}`)
      return res.status(404).json({ error: 'Subscription expired' })
    }

    // Create notification payload with defaults
    const notificationPayload = {
      notification: {
        title: title || "New Notification",
        body: body || "This is a new notification",
        icon: icon || "/icon.png",
      },
    }

    console.log(`Sending notification to subscription ${id}...`)
    // Send push notification using web-push library
    await webpush.sendNotification(
      subscriptionObj.subscription,
      JSON.stringify(notificationPayload)
    )

    console.log(`Notification sent successfully to ${id}`)
    res.status(200).json({
      message: "Notification sent successfully",
      id: id
    })
  } catch (error) {
    console.error(`Error sending notification to ${req.params.id}:`, error.message)
    // Remove invalid subscriptions (HTTP 410 Gone or 404 Not Found)
    if (error.statusCode === 410 || error.statusCode === 404) {
      console.log(`Removing invalid subscription ${req.params.id}`)
      await redisClient.del(`subscription:${req.params.id}`)
    }
    res.status(500).json({
      error: 'Failed to send notification',
      details: error.message
    })
  }
})


/**
 * Health check endpoint
 * Provides server status, Redis connection status, and subscription count
 * @route GET /health
 * @returns {Object} 200 - Health status information
 */
app.get("/health", async (req, res) => {
  try {
    let subscriptionCount = 0
    if (redisClient.isOpen) {
      const keys = await redisClient.keys("subscription:*")
      subscriptionCount = keys.length
    }
    
    res.json({ 
      status: "OK", 
      redis: redisClient.isOpen ? "connected" : "disconnected",
      totalSubscriptions: subscriptionCount,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    res.json({ 
      status: "OK", 
      redis: redisClient.isOpen ? "connected" : "disconnected",
      totalSubscriptions: "unknown",
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * Cleanup expired subscriptions endpoint
 * Manually removes all expired subscriptions from Redis storage
 * @route POST /cleanup-expired
 * @returns {Object} 200 - Cleanup results with count of removed subscriptions
 * @returns {Object} 500 - Error during cleanup process
 */
app.post("/cleanup-expired", async (req, res) => {
  try {
    console.log('Starting cleanup of expired subscriptions...')
    
    // Ensure Redis connection is active
    if (!redisClient.isOpen) {
      throw new Error('Redis client is not connected')
    }
    
    // Get all subscription keys from Redis
    const subscriptionKeys = await redisClient.keys("subscription:*")
    let expiredCount = 0
    
    // Process each subscription to check for expiry
    for (const key of subscriptionKeys) {
      try {
        const subscriptionData = await redisClient.get(key)
        if (subscriptionData) {
          const subscription = JSON.parse(subscriptionData)
          // Remove expired subscriptions
          if (isSubscriptionExpired(subscription)) {
            await redisClient.del(key)
            expiredCount++
            console.log(`Removed expired subscription: ${subscription.id}`)
          }
        }
      } catch (error) {
        console.error(`Error processing subscription key ${key}:`, error.message)
      }
    }
    
    console.log(`Cleanup complete. Removed ${expiredCount} expired subscriptions.`)
    res.json({ 
      message: 'Cleanup completed',
      expiredSubscriptionsRemoved: expiredCount,
      totalProcessed: subscriptionKeys.length
    })
  } catch (error) {
    console.error('Error during cleanup:', error.message)
    res.status(500).json({ error: 'Failed to cleanup expired subscriptions', details: error.message })
  }
})

/**
 * Global error handling middleware
 * Catches and handles any unhandled errors in the application
 * @param {Error} err - The error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(port, () => {
  console.log(`Server started on port ${port}`)
  console.log(`Health check available at http://localhost:${port}/health`)
})