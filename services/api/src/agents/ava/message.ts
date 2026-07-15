/**
 * Routes : Agent Conversationnel Ava
 *
 * POST /agents/ava/sessions              → créer une session
 * POST /agents/ava/sessions/:id/message  → envoyer un message
 * GET  /agents/ava/sessions              → liste des sessions
 * GET  /agents/ava/sessions/:id          → détail + messages
 */

import { Hono }         from 'hono'
import { zValidator }   from '@hono/zod-validator'
import { z }            from 'zod'
import { createClient } from '@supabase/supabase-js'
import { readFileSync }  from 'node:fs'
import { join }          from 'node:path'
import {
  workspaceMiddleware,
  type WorkspaceContext,
} from '../../middleware/validate-workspace.js'

// ─────────────────────────────────────────────────────────────
// Schémas
// ─────────────────────────────────────────────────────────────

const MessageSchema = z.object({
  content:  z.string().min(1).max(4000),
  metadata: z.record(z.unknown()).optional().default({}),
})

const CreateSessionSchema = z.object({
  user_ref:  z.string().optional(),
  channel:   z.enum(['chat', 'email', 'form']).default('chat'),
  metadata:  z.record(z.unknown()).optional().default({}),
})

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function serverClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function getAvaAgent(workspaceId: string) {
  const supabase = serverClient()
  const { data } = await supabase
    .from('agents')
    .select('id, name, config')
    .eq('workspace_id', workspaceId)
    .eq('type', 'conversational')
    .eq('is_active', true)
    .single()
  return data
}

async function validateSession(sessionId: string, workspaceId: string) {
  const supabase = serverClient()
  const { data } = await supabase
    .from('sessions')
    .select('id, status, user_ref')
    .eq('id', sessionId)
    .eq('workspace_id', workspaceId)
    .single()
  if (!data) return null
  if (data.status === 'resolved' || data.status === 'transferred') return null
  return data
}

// ─────────────────────────────────────────────────────────────
// Prompt système Ava
// ─────────────────────────────────────────────────────────────

function buildAvaPrompt(workspaceName: string): string {
  try {
    const filePath = join(process.cwd(), '..', '..', 'packages', 'prompts', 'agent-ava.system.md')
    const raw = readFileSync(filePath, 'utf-8')
    return raw
      .replace(/\{\{COMPANY_NAME\}\}/g,     workspaceName)
      .replace(/\{\{WORKSPACE_ID\}\}/g,     '')
      .replace(/\{\{CHANNEL\}\}/g,          'chat')
      .replace(/\{\{CURRENT_DATETIME\}\}/g, new Date().toISOString())
      .replace(/\{\{#if AGENT_MEMORY\}\}[\s\S]*?\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g, '$1')
      .replace(/\{\{#if KB_CHUNKS\}\}[\s\S]*?\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g, '$1')
      .replace(/\{\{[\w_]+\}\}/g, '')
  } catch {
    return `Tu es Ava, l'agent conversationnel de ${workspaceName}.
Tu es chaleureuse, réactive et persuasive.
Tu engages les visiteurs, comprends leurs besoins et crées des opportunités.
Pose une question à la fois. Réponses courtes (max 4 lignes).
Collecte prénom + email quand tu détectes une intention d'achat.
Jamais plus d'une question par message.`
  }
}

// ─────────────────────────────────────────────────────────────
// Appel DeepSeek
// ─────────────────────────────────────────────────────────────

async function callDeepSeek(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<{ text: string; tokensUsed: number }> {
  const res = await fetch(
    `${process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1'}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model:      process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
        messages:   [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: 512,
      }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`DeepSeek error ${res.status}: ${err}`)
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>
    usage?:  { total_tokens?: number }
  }

  return {
    text:       data.choices[0]?.message?.content ?? '',
    tokensUsed: data.usage?.total_tokens ?? 0,
  }
}

// ─────────────────────────────────────────────────────────────
// Détection d'actions
// ─────────────────────────────────────────────────────────────

function detectHandoffToSupport(text: string): boolean {
  return ['HANDOFF_TO_SUPPORT', 'équipe support', 'transférer à notre équipe'].some(m =>
    text.toLowerCase().includes(m.toLowerCase())
  )
}

function detectLeadCollection(text: string): boolean {
  return ['votre email', 'votre prénom', 'créer votre demande'].some(m =>
    text.toLowerCase().includes(m.toLowerCase())
  )
}

// ─────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────

export const avaRoute = new Hono()

// ── POST /sessions ───────────────────────────────────────────

avaRoute.post(
  '/sessions',
  workspaceMiddleware({ allowWidget: true }),
  zValidator('json', CreateSessionSchema),
  async (c) => {
    const ctx  = c.get('workspace') as WorkspaceContext
    const body = c.req.valid('json')

    const agent = await getAvaAgent(ctx.workspaceId)
    if (!agent) {
      return c.json({ error: 'Agent Ava non configuré', code: 'AGENT_NOT_FOUND' }, 404)
    }

    const supabase = serverClient()
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
      return c.json({ error: 'Impossible de créer la session', code: 'CREATE_ERROR' }, 500)
    }

    return c.json(session, 201)
  }
)

// ── POST /sessions/:id/message ───────────────────────────────

avaRoute.post(
  '/sessions/:sessionId/message',
  workspaceMiddleware({ allowWidget: true, quota: 'messages' }),
  zValidator('json', MessageSchema),
  async (c) => {
    const ctx       = c.get('workspace') as WorkspaceContext
    const sessionId = c.req.param('sessionId')
    const body      = c.req.valid('json')
    const supabase  = serverClient()

    const session = await validateSession(sessionId, ctx.workspaceId)
    if (!session) {
      return c.json({ error: 'Session introuvable', code: 'SESSION_NOT_FOUND' }, 404)
    }

    const agent = await getAvaAgent(ctx.workspaceId)
    if (!agent) {
      return c.json({ error: 'Agent Ava non configuré', code: 'AGENT_NOT_FOUND' }, 404)
    }

    // Historique
    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(20)

    const llmMessages = [
      ...(history ?? [])
        .filter((m: any) => m.role !== 'system')
        .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: body.content },
    ]

    // Appel LLM
    const startTime = Date.now()
    let text = ''
    let tokensUsed = 0

    try {
      const systemPrompt = buildAvaPrompt(ctx.workspaceName)
      const result = await callDeepSeek(systemPrompt, llmMessages)
      text       = result.text
      tokensUsed = result.tokensUsed
      console.log(`[ava] response length: ${text.length}, tokens: ${tokensUsed}`)
    } catch (err) {
      console.error('[ava] LLM error:', err)
      return c.json({
        error: 'Erreur technique momentanée',
        code:  'LLM_ERROR',
        message: {
          id: crypto.randomUUID(), session_id: sessionId, role: 'assistant',
          content: "Oups, je rencontre un petit souci technique 😅 Pouvez-vous réessayer dans un instant ?",
          created_at: new Date().toISOString(),
        },
      }, 500)
    }

    const latencyMs = Date.now() - startTime

    // Sauvegarder messages
    await supabase.from('messages').insert([
      { session_id: sessionId, role: 'user',      content: body.content },
      { session_id: sessionId, role: 'assistant', content: text, tokens_used: tokensUsed, latency_ms: latencyMs },
    ])

    // Détecter actions
    let actionTriggered: string | null = null
    if (detectHandoffToSupport(text))  actionTriggered = 'HANDOFF_TO_SUPPORT'
    else if (detectLeadCollection(text)) actionTriggered = 'LEAD_COLLECTION_STARTED'

    return c.json({
      message: {
        id:         crypto.randomUUID(),
        session_id: sessionId,
        role:       'assistant',
        content:    text,
        metadata:   { tokens_used: tokensUsed, latency_ms: latencyMs },
        created_at: new Date().toISOString(),
      },
      session_id:       sessionId,
      action_triggered: actionTriggered,
    })
  }
)

// ── GET /sessions ────────────────────────────────────────────

avaRoute.get(
  '/sessions',
  workspaceMiddleware(),
  async (c) => {
    const ctx      = c.get('workspace') as WorkspaceContext
    const page     = Number(c.req.query('page') ?? 1)
    const perPage  = Math.min(Number(c.req.query('per_page') ?? 20), 100)
    const supabase = serverClient()
    const agent    = await getAvaAgent(ctx.workspaceId)

    let query = supabase
      .from('sessions')
      .select('*', { count: 'exact' })
      .eq('workspace_id', ctx.workspaceId)
      .order('updated_at', { ascending: false })
      .range((page - 1) * perPage, page * perPage - 1)

    if (agent) query = query.eq('agent_id', agent.id)

    const { data, count } = await query
    return c.json({
      sessions: data ?? [],
      pagination: { total: count ?? 0, page, per_page: perPage, has_more: (count ?? 0) > page * perPage },
    })
  }
)

// ── GET /sessions/:id ────────────────────────────────────────

avaRoute.get(
  '/sessions/:sessionId',
  workspaceMiddleware(),
  async (c) => {
    const ctx       = c.get('workspace') as WorkspaceContext
    const sessionId = c.req.param('sessionId')
    const supabase  = serverClient()

    const [sessionRes, messagesRes] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', sessionId).eq('workspace_id', ctx.workspaceId).single(),
      supabase.from('messages').select('*').eq('session_id', sessionId).order('created_at', { ascending: true }),
    ])

    if (!sessionRes.data) {
      return c.json({ error: 'Session introuvable', code: 'NOT_FOUND' }, 404)
    }

    return c.json({ session: sessionRes.data, messages: messagesRes.data ?? [] })
  }
)
