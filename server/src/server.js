import express from "express"
import bodyParser from "body-parser"
import webpush from "web-push"
import redis from "redis"
import cors from "cors"
import morgan from "morgan"
import { v4 as uuidv4 } from "uuid"


const port = 3003
const app = express()

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:8080', 'http://127.0.0.1:8080'],
  credentials: true
}))
app.use(morgan("dev"))
app.use(bodyParser.json())

// Redis client setup
const redisClient = redis.createClient({
  host: 'localhost',
  port: 6379,
  retry_strategy: (options) => {
    if (options.error && options.error.code === 'ECONNREFUSED') {
      console.log('Redis server refused connection. Retrying...')
    }
    if (options.total_retry_time > 1000 * 60 * 60) {
      return new Error('Retry time exhausted')
    }
    if (options.attempt > 10) {
      return undefined
    }
    return Math.min(options.attempt * 100, 3000)
  }
})

redisClient.on("error", (err) => {
  console.log("Redis Client Error:", err.message)
})

redisClient.on("connect", () => {
  console.log("Connected to Redis!")
})

async function connectRedis() {
  try {
    await redisClient.connect()
    console.log("Redis connection established!")
  } catch (err) {
    console.error("Redis connection error:", err.message)
    console.log("Attempting to reconnect to Redis in 5 seconds...")
    setTimeout(connectRedis, 5000)
  }
}

// Utility functions
const generateSubscriptionId = () => {
  return uuidv4()
}

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

const isSubscriptionExpired = (subscriptionObj) => {
  return new Date() > new Date(subscriptionObj.expiresAt)
}

// Connect to Redis
connectRedis()

// VAPID keys setup
const vapidKeys = {
  publicKey: "BGqrNPCHC4zRpHFbg1SNh_0Zqj4ePCiuISgVVSzAY0SzZF7vWDpz0lzeP67-Huj_iDg569tvG-eHcKFtbyUZU4g",
  privateKey: "LkTN9xnaU7BKKhw-T1NATTrQsIJ3xN5AVzipL0zDBdY",
}

webpush.setVapidDetails(
  "mailto:your-email@example.com",
  vapidKeys.publicKey,
  vapidKeys.privateKey
)

// Routes
app.get("/", (req, res) => {
  res.json({ message: "Push notification server is running!" })
})

app.get("/subscriptions", async (req, res) => {
  try {
    console.log('Fetching all subscriptions from Redis...')
    
    if (!redisClient.isOpen) {
      throw new Error('Redis client is not connected')
    }
    
    const subscriptionKeys = await redisClient.keys("subscription:*")
    console.log(`Found ${subscriptionKeys.length} subscription keys in Redis`)
    
    if (subscriptionKeys.length === 0) {
      return res.json([])
    }

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
    }).filter(Boolean)
    
    console.log(`Returning ${parsedSubscriptions.length} active subscriptions`)
    res.json(parsedSubscriptions)
  } catch (error) {
    console.error('Error fetching subscriptions:', error.message)
    res.status(500).json({ error: 'Failed to fetch subscriptions', details: error.message })
  }
})

app.get("/subscriptions/:id", async (req, res) => {
  try {
    const { id } = req.params
    console.log(`Fetching subscription with ID: ${id}`)
    
    if (!redisClient.isOpen) {
      throw new Error('Redis client is not connected')
    }
    
    const subscriptionData = await redisClient.get(`subscription:${id}`)
    
    if (!subscriptionData) {
      return res.status(404).json({ error: 'Subscription not found' })
    }
    
    const subscription = JSON.parse(subscriptionData)
    
    // Check if subscription is expired
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

app.delete("/unsubscribe/:id", async (req, res) => {
  try {
    const { id } = req.params
    console.log(`Deleting subscription with ID: ${id}`)
    
    if (!redisClient.isOpen) {
      throw new Error('Redis client is not connected')
    }
    
    const result = await redisClient.del(`subscription:${id}`)
    
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
app.post("/subscribe", async (req, res) => {
  try {
    const subscriptionData = req.body
    console.log('Received subscription request')
    console.log('Subscription endpoint:', subscriptionData.endpoint)
    console.log('Keys present:', !!subscriptionData.keys)
    
    if (!subscriptionData || !subscriptionData.endpoint || !subscriptionData.keys) {
      return res.status(400).json({ error: 'Invalid subscription data' })
    }
    
    if (!redisClient.isOpen) {
      throw new Error('Redis client is not connected')
    }
    
    // Create subscription object with ID and expiry
    const subscriptionObj = createSubscriptionObject(subscriptionData)
    const subscriptionString = JSON.stringify(subscriptionObj)
    
    // Store with the subscription ID as key
    await redisClient.set(`subscription:${subscriptionObj.id}`, subscriptionString)
    
    // Set TTL for automatic cleanup (365 days)
    await redisClient.expire(`subscription:${subscriptionObj.id}`, 365 * 24 * 60 * 60)
    
    console.log(`Subscription saved to Redis with ID: ${subscriptionObj.id}`)
    
    // Get total count of subscriptions
    const allKeys = await redisClient.keys("subscription:*")
    console.log(`Total subscriptions in Redis: ${allKeys.length}`)
    
    res.status(201).json({ 
      message: 'Subscription added successfully',
      id: subscriptionObj.id,
      expiresAt: subscriptionObj.expiresAt,
      totalSubscriptions: allKeys.length
    })
  } catch (error) {
    console.error('Error saving subscription:', error.message)
    res.status(500).json({ error: 'Failed to save subscription', details: error.message })
  }
})

app.post("/send-notification", async (req, res) => {
  try {
    const { title, body, icon } = req.body
    console.log('Received send-notification request')
    console.log('Notification data:', { title, body, icon })
    
    const notificationPayload = {
      notification: {
        title: title || "New Notification",
        body: body || "This is a new notification",
        icon: icon || "/icon.png",
      },
    }

    console.log('Fetching subscriptions from Redis...')
    
    if (!redisClient.isOpen) {
      throw new Error('Redis client is not connected')
    }
    
    const subscriptionKeys = await redisClient.keys("subscription:*")
    console.log(`Found ${subscriptionKeys.length} subscription keys`)
    
    if (subscriptionKeys.length === 0) {
      console.log('No subscriptions found in Redis')
      return res.status(404).json({ error: 'No subscriptions found' })
    }

    const subscriptions = await redisClient.mGet(subscriptionKeys)
    console.log('Sending notifications to all active subscriptions...')
    
    const results = []
    let activeSubscriptions = 0
    
    for (let i = 0; i < subscriptions.length; i++) {
      try {
        const subscriptionObj = JSON.parse(subscriptions[i])
        
        // Check if subscription is expired
        if (isSubscriptionExpired(subscriptionObj)) {
          console.log(`Subscription ${subscriptionObj.id} is expired, skipping and removing`)
          await redisClient.del(subscriptionKeys[i])
          results.push({ success: false, id: subscriptionObj.id, error: 'Subscription expired' })
          continue
        }

        activeSubscriptions++
        console.log(`Sending notification ${activeSubscriptions}/${subscriptionKeys.length} to subscription ${subscriptionObj.id}`)
        
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
        
        // If subscription is invalid, remove it
        if (error.statusCode === 410 || error.statusCode === 404) {
          console.log(`Removing invalid subscription ${subscriptionObj.id}`)
          await redisClient.del(subscriptionKeys[i])
        }
      }
    }

    const successCount = results.filter(r => r.success).length
    const failureCount = results.filter(r => !r.success).length
    
    console.log(`Notification sending complete. Success: ${successCount}, Failures: ${failureCount}`)
    
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

app.post("/send-notification/:id", async (req, res) => {
  try {
    const { id } = req.params
    const { title, body, icon } = req.body

    console.log(`Received request to send notification to subscription ${id}`)

    if (!redisClient.isOpen) {
      throw new Error('Redis client is not connected')
    }

    const subscriptionData = await redisClient.get(`subscription:${id}`)
    if (!subscriptionData) {
      return res.status(404).json({ error: 'Subscription not found' })
    }

    const subscriptionObj = JSON.parse(subscriptionData)

    // Check expiry
    if (isSubscriptionExpired(subscriptionObj)) {
      console.log(`Subscription ${id} is expired, removing it`)
      await redisClient.del(`subscription:${id}`)
      return res.status(404).json({ error: 'Subscription expired' })
    }

    const notificationPayload = {
      notification: {
        title: title || "New Notification",
        body: body || "This is a new notification",
        icon: icon || "/icon.png",
      },
    }

    console.log(`Sending notification to subscription ${id}...`)
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
    // Remove invalid subscription
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


// Health check endpoint
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

// Cleanup expired subscriptions endpoint (optional - for manual cleanup)
app.post("/cleanup-expired", async (req, res) => {
  try {
    console.log('Starting cleanup of expired subscriptions...')
    
    if (!redisClient.isOpen) {
      throw new Error('Redis client is not connected')
    }
    
    const subscriptionKeys = await redisClient.keys("subscription:*")
    let expiredCount = 0
    
    for (const key of subscriptionKeys) {
      try {
        const subscriptionData = await redisClient.get(key)
        if (subscriptionData) {
          const subscription = JSON.parse(subscriptionData)
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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(port, () => {
  console.log(`Server started on port ${port}`)
  console.log(`Health check available at http://localhost:${port}/health`)
})