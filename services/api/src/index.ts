import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { orchestratorRoute } from './routes/orchestrator'
import { messageRoute as supportMessageRoute } from './agents/support/message'
import { salesRoute } from './agents/sales/message'

const app = new Hono()

app.use(logger())
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}))

app.route('/v1/agents/support', supportMessageRoute)
app.route('/v1/agents/sales', salesRoute)
app.route('/v1/orchestrator', orchestratorRoute)

app.get('/health', (c) => c.json({ status: 'ok' }))

const port = parseInt(process.env.PORT || '8000', 10)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`)
})