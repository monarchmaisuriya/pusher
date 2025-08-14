import express from "express"
import bodyParser from "body-parser"
import webpush from "web-push"
import redis from "redis"
import cors from "cors"
import morgan from "morgan"

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
    console.log('Fetching subscriptions from Redis...')
    
    if (!redisClient.isOpen) {
      throw new Error('Redis client is not connected')
    }
    
    const subscriptions = await redisClient.sMembers("subscriptions")
    console.log(`Found ${subscriptions.length} subscriptions in Redis`)
    
    const parsedSubscriptions = subscriptions.map((sub) => {
      try {
        return JSON.parse(sub)
      } catch (error) {
        console.error('Error parsing subscription:', error)
        return null
      }
    }).filter(Boolean)
    
    console.log('Returning subscriptions:', parsedSubscriptions.length)
    res.json(parsedSubscriptions)
  } catch (error) {
    console.error('Error fetching subscriptions:', error.message)
    res.status(500).json({ error: 'Failed to fetch subscriptions', details: error.message })
  }
})

app.post("/subscribe", async (req, res) => {
  try {
    const subscription = req.body
    console.log('Received subscription request')
    console.log('Subscription endpoint:', subscription.endpoint)
    console.log('Keys present:', !!subscription.keys)
    
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ error: 'Invalid subscription data' })
    }
    
    if (!redisClient.isOpen) {
      throw new Error('Redis client is not connected')
    }
    
    const subscriptionString = JSON.stringify(subscription)
    const result = await redisClient.sAdd("subscriptions", subscriptionString)
    
    console.log(`Subscription saved to Redis. New subscription: ${result === 1}`)
    
    // Verify it was saved
    const count = await redisClient.sCard("subscriptions")
    console.log(`Total subscriptions in Redis: ${count}`)
    
    res.status(201).json({ 
      message: 'Subscription added successfully',
      isNew: result === 1,
      totalSubscriptions: count
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
    
    const subscriptions = await redisClient.sMembers("subscriptions")
    console.log(`Found ${subscriptions.length} subscriptions`)
    
    if (subscriptions.length === 0) {
      console.log('No subscriptions found in Redis')
      return res.status(404).json({ error: 'No subscriptions found' })
    }

    console.log('Sending notifications to all subscriptions...')
    const results = []
    
    for (let i = 0; i < subscriptions.length; i++) {
      try {
        const subscription = JSON.parse(subscriptions[i])
        console.log(`Sending notification ${i + 1}/${subscriptions.length}`)
        
        await webpush.sendNotification(
          subscription,
          JSON.stringify(notificationPayload)
        )
        
        results.push({ success: true, index: i })
        console.log(`Notification ${i + 1} sent successfully`)
      } catch (error) {
        console.error(`Failed to send notification ${i + 1}:`, error.message)
        results.push({ success: false, index: i, error: error.message })
        
        // If subscription is invalid, remove it
        if (error.statusCode === 410 || error.statusCode === 404) {
          console.log(`Removing invalid subscription ${i + 1}`)
          await redisClient.sRem("subscriptions", subscriptions[i])
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
      results: results
    })
  } catch (error) {
    console.error('Error sending notifications:', error.message)
    res.status(500).json({ error: 'Failed to send notifications', details: error.message })
  }
})

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    redis: redisClient.isOpen ? "connected" : "disconnected",
    timestamp: new Date().toISOString()
  })
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