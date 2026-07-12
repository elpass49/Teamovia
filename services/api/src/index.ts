import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

// Import route handlers
// import { orchestratorRoute } from './routes/orchestrator'
// import { messageRoute as supportMessageRoute } from './agents/support/message'
// import { salesRoute } from './agents/sales/message'

const app = new Hono()

// Middleware
app.use(logger())
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  })
)

// Routes (placeholder — uncomment when ready)
// app.route('/api/orchestrator', orchestratorRoute)
// app.route('/api/agents/support', supportMessageRoute)
// app.route('/api/agents/sales', salesRoute)

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

const port = parseInt(process.env.PORT || '8000', 10)

console.log(`🚀 Teamovia API starting on http://localhost:${port}`)
serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`✅ Server running at http://localhost:${info.port}`)
  }
)
