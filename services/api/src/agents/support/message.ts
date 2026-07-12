/**
 * Route : POST /agents/support/sessions/:sessionId/message
 *
 * C'est la route principale de l'agent support.
 * Elle reçoit un message utilisateur, exécute le pipeline complet
 * (RAG → LLM → log → actions) et retourne la réponse de l'agent.
 *
 * Auth : JWT Supabase OU x-workspace-token (widget embarquable)
 * Quota : vérifié avant l'exécution (messages/mois)
 */

import { Hono }                  from 'hono'
import { zValidator }            from '@hono/zod-validator'
import { z }                     from 'zod'
import { createClient }          from '@supabase/supabase-js'
import { createAgentRunner }     from '@teamovia/agents-sdk'
import {
  workspaceMiddleware,
  type WorkspaceContext,
} from '../../middleware/validate-workspace'

// ─────────────────────────────────────────────────────────────
// Schéma de validation
// ─────────────────────────────────────────────────────────────

const MessageSchema = z.object({
  content: z
    .string()
    .min(1,    'Le message ne peut pas être vide')
    .max(4000, 'Message trop long (max 4000 caractères)'),
  metadata: z.record(z.unknown()).optional().default({}),
})

// ─────────────────────────────────────────────────────────────
// Helper : récupérer l'agent support du workspace
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// Helper : vérifier que la session appartient au workspace
// ─────────────────────────────────────────────────────────────

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

  // Refuser les sessions déjà clôturées
  if (data.status === 'resolved' || data.status === 'transferred') {
    return null
  }

  return { user_ref: data.user_ref as string | null }
}

// ─────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────

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

    // ── Vérification de la session ─────────────────────────
    const session = await validateSession(sessionId, ctx.workspaceId)
    if (!session) {
      return c.json(
        { error: 'Session introuvable ou déjà clôturée', code: 'SESSION_NOT_FOUND' },
        404
      )
    }

    // ── Récupération de l'agent support ────────────────────
    const agent = await getSupportAgent(ctx.workspaceId)
    if (!agent) {
      return c.json(
        { error: 'Agent support non configuré pour ce workspace', code: 'AGENT_NOT_FOUND' },
        404
      )
    }

    // ── Exécution du pipeline agent ────────────────────────
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
      console.error('[support/message] Runner error:', err)

      // Réponse de fallback à l'utilisateur
      return c.json(
        {
          error:   'Une erreur est survenue lors du traitement de votre message.',
          code:    'RUNNER_ERROR',
          message: {
            id:         crypto.randomUUID(),
            session_id: sessionId,
            role:       'assistant',
            content:    'Je rencontre une difficulté technique momentanée. Merci de réessayer dans quelques instants.',
            created_at: new Date().toISOString(),
          },
        },
        500
      )
    }

    // ── Réponse ────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// Route : POST /agents/support/sessions
// Crée une nouvelle session (utilisé par le widget embarquable)
// ─────────────────────────────────────────────────────────────

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
        { error: 'Agent support non configuré', code: 'AGENT_NOT_FOUND' },
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

    if (error || !session) {
      return c.json(
        { error: 'Impossible de créer la session', code: 'SESSION_CREATE_ERROR' },
        500
      )
    }

    return c.json(session, 201)
  }
)

// ─────────────────────────────────────────────────────────────
// Route : GET /agents/support/sessions
// Liste les sessions (dashboard opérateur)
// ─────────────────────────────────────────────────────────────

messageRoute.get(
  '/sessions',
  workspaceMiddleware(),   // JWT uniquement — pas de widget
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

// ─────────────────────────────────────────────────────────────
// Route : GET /agents/support/sessions/:sessionId
// Détail + messages d'une session
// ─────────────────────────────────────────────────────────────

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
