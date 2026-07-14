import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { orchestratorRoute } from './routes/orchestrator.js'
import { messageRoute as supportMessageRoute } from './agents/support/message.js'
import { salesRoute } from './agents/sales/message.js'
import { knowledgeRoute } from './routes/knowledge.js'

const app = new Hono()

// Middleware
app.use(logger())
app.use(cors({
  origin: (origin) => origin ?? '*',
  allowHeaders: ['Authorization', 'x-workspace-token', 'Content-Type'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
}))

// Routes
app.route('/v1/agents/support', supportMessageRoute)
app.route('/v1/agents/sales',   salesRoute)
app.route('/v1/orchestrator',   orchestratorRoute)
app.route('/v1/knowledge', knowledgeRoute)

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

const port = parseInt(process.env.PORT || '8000', 10)

serve(
  { fetch: app.fetch, port },
  (info) => {
    console.log(`Server running at http://localhost:${info.port}`)
  }
)