/**
 * Route : POST /agents/support/sessions/:sessionId/message
 *
 * C'est la route principale de l'agent support.
 * Elle reÃ§oit un message utilisateur, exÃ©cute le pipeline complet
 * (RAG â†’ LLM â†’ log â†’ actions) et retourne la rÃ©ponse de l'agent.
 *
 * Auth : JWT Supabase OU x-workspace-token (widget embarquable)
 * Quota : vÃ©rifiÃ© avant l'exÃ©cution (messages/mois)
 */

import { Hono }                  from 'hono'
import { zValidator }            from '@hono/zod-validator'
import { z }                     from 'zod'
import { createClient }          from '@supabase/supabase-js'
import { createAgentRunner }     from '@teamovia/agents-sdk'
import {
  workspaceMiddleware,
  type WorkspaceContext,
} from '../../middleware/validate-workspace.js'

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SchÃ©ma de validation
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const MessageSchema = z.object({
  content: z
    .string()
    .min(1,    'Le message ne peut pas Ãªtre vide')
    .max(4000, 'Message trop long (max 4000 caractÃ¨res)'),
  metadata: z.record(z.unknown()).optional().default({}),
})

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Helper : rÃ©cupÃ©rer l'agent support du workspace
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getSupportAgent(workspaceId: string): Promise<{
  id:   string
  name: string
} | null> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data, error } = await supabase
    .from('agents')
    .select('id, name')
    .eq('workspace_id', workspaceId)
    .eq('type', 'support')
    .eq('is_active', true)
    .single()

  if (error || !data) return null
  return { id: data.id as string, name: data.name as string }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Helper : vÃ©rifier que la session appartient au workspace
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function validateSession(
  sessionId:   string,
  workspaceId: string
): Promise<{ user_ref: string | null } | null> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data, error } = await supabase
    .from('sessions')
    .select('id, workspace_id, status, user_ref')
    .eq('id', sessionId)
    .eq('workspace_id', workspaceId)
    .single()

  if (error || !data) return null

  // Refuser les sessions dÃ©jÃ  clÃ´turÃ©es
  if (data.status === 'resolved' || data.status === 'transferred') {
    return null
  }

  return { user_ref: data.user_ref as string | null }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Route handler
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const messageRoute = new Hono()

messageRoute.post(
  '/sessions/:sessionId/message',

  // 1. Auth + quota
  workspaceMiddleware({
    quota:       'messages',
    allowWidget: true,  // le widget public peut envoyer des messages
  }),

  // 2. Validation du body
  zValidator('json', MessageSchema),

  // 3. Handler principal
  async (c) => {
    const ctx       = c.get('workspace') as WorkspaceContext
    const sessionId = c.req.param('sessionId')
    const body      = c.req.valid('json')

    // â”€â”€ VÃ©rification de la session â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const session = await validateSession(sessionId, ctx.workspaceId)
    if (!session) {
      return c.json(
        { error: 'Session introuvable ou dÃ©jÃ  clÃ´turÃ©e', code: 'SESSION_NOT_FOUND' },
        404
      )
    }

    // â”€â”€ RÃ©cupÃ©ration de l'agent support â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const agent = await getSupportAgent(ctx.workspaceId)
    if (!agent) {
      return c.json(
        { error: 'Agent support non configurÃ© pour ce workspace', code: 'AGENT_NOT_FOUND' },
        404
      )
    }

    // â”€â”€ ExÃ©cution du pipeline agent â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let result
    try {
      result = await createAgentRunner({
        agentType:     'support',
        agentId:       agent.id,
        workspaceId:   ctx.workspaceId,
        workspaceName: ctx.workspaceName,
        sessionId,
        userRef:       session.user_ref ?? undefined,
        userMessage:   body.content,
      })
    } catch (err) {
      // Log l'erreur dans agent_logs sans crasher le serveur
      console.error('[support/message] catch error:', err)
      console.error('[support/message] Runner error:', err)

      // RÃ©ponse de fallback Ã  l'utilisateur
      return c.json(
        {
          error:   'Une erreur est survenue lors du traitement de votre message.',
          code:    'RUNNER_ERROR',
          message: {
            id:         crypto.randomUUID(),
            session_id: sessionId,
            role:       'assistant',
            content:    'Je rencontre une difficultÃ© technique momentanÃ©e. Merci de rÃ©essayer dans quelques instants.',
            created_at: new Date().toISOString(),
          },
        },
        500
      )
    }

    // â”€â”€ RÃ©ponse â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    return c.json({
      message: {
        id:          crypto.randomUUID(),
        session_id:  sessionId,
        role:        'assistant',
        content:     result.text,
        metadata: {
          tokens_used:     result.tokensUsed,
          latency_ms:      result.latencyMs,
        },
        created_at: new Date().toISOString(),
      },
      session_id:       sessionId,
      action_triggered: result.actionTriggered,
    })
  }
)

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Route : POST /agents/support/sessions
// CrÃ©e une nouvelle session (utilisÃ© par le widget embarquable)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const CreateSessionSchema = z.object({
  user_ref:  z.string().optional(),
  channel:   z.enum(['chat', 'email', 'form']).default('chat'),
  metadata:  z.record(z.unknown()).optional().default({}),
})

messageRoute.post(
  '/sessions',

  workspaceMiddleware({ allowWidget: true }),
  zValidator('json', CreateSessionSchema),

  async (c) => {
    const ctx  = c.get('workspace') as WorkspaceContext
    const body = c.req.valid('json')

    const agent = await getSupportAgent(ctx.workspaceId)
    if (!agent) {
      return c.json(
        { error: 'Agent support non configurÃ©', code: 'AGENT_NOT_FOUND' },
        404
      )
    }

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const { data: session, error } = await supabase
      .from('sessions')
      .insert({
        workspace_id: ctx.workspaceId,
        agent_id:     agent.id,
        user_ref:     body.user_ref ?? null,
        channel:      body.channel,
        status:       'open',
        metadata:     body.metadata,
      })
      .select()
      .single()
    console.log('[DEBUG] agent:', agent)
    console.log('[DEBUG] session lookup done')

    if (error || !session) {
      return c.json(
        { error: 'Impossible de crÃ©er la session', code: 'SESSION_CREATE_ERROR' },
        500
      )
    }

    return c.json(session, 201)
  }
)

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Route : GET /agents/support/sessions
// Liste les sessions (dashboard opÃ©rateur)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

messageRoute.get(
  '/sessions',
  workspaceMiddleware(),   // JWT uniquement â€” pas de widget
  async (c) => {
    const ctx     = c.get('workspace') as WorkspaceContext
    const status  = c.req.query('status')
    const channel = c.req.query('channel')
    const page    = Number(c.req.query('page') ?? 1)
    const perPage = Math.min(Number(c.req.query('per_page') ?? 20), 100)

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    let query = supabase
      .from('sessions')
      .select('*', { count: 'exact' })
      .eq('workspace_id', ctx.workspaceId)
      .order('created_at', { ascending: false })
      .range((page - 1) * perPage, page * perPage - 1)

    if (status)  query = query.eq('status', status)
    if (channel) query = query.eq('channel', channel)

    const { data, error, count } = await query

    if (error) {
      return c.json({ error: error.message, code: 'DB_ERROR' }, 500)
    }

    return c.json({
      sessions: data ?? [],
      pagination: {
        total:    count ?? 0,
        page,
        per_page: perPage,
        has_more: (count ?? 0) > page * perPage,
      },
    })
  }
)

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Route : GET /agents/support/sessions/:sessionId
// DÃ©tail + messages d'une session
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

messageRoute.get(
  '/sessions/:sessionId',
  workspaceMiddleware(),
  async (c) => {
    const ctx       = c.get('workspace') as WorkspaceContext
    const sessionId = c.req.param('sessionId')

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const [sessionRes, messagesRes] = await Promise.all([
      supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('workspace_id', ctx.workspaceId)
        .single(),
      supabase
        .from('messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true }),
    ])

    if (sessionRes.error || !sessionRes.data) {
      return c.json({ error: 'Session introuvable', code: 'SESSION_NOT_FOUND' }, 404)
    }

    return c.json({
      session:  sessionRes.data,
      messages: messagesRes.data ?? [],
    })
  }
)

