import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { orchestratorRoute } from './routes/orchestrator.js'
import { messageRoute as supportMessageRoute } from './agents/support/message.js'
import { salesRoute } from './agents/sales/message.js'
import { knowledgeRoute } from './routes/knowledge.js'
import { avaRoute } from './agents/ava/message.js'
import { miloRoute } from './agents/milo/generate.js'
import { saraRoute } from './agents/sara/orchestrate.js'

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
app.route('/v1/agents/ava', avaRoute)
app.route('/v1/agents/milo', miloRoute)
app.route('/v1/agents/sara', saraRoute)

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

const port = parseInt(process.env.PORT || '8000', 10)

serve(
  { fetch: app.fetch, port },
  (info) => {
    console.log(`Server running at http://localhost:${info.port}`)
  }
)