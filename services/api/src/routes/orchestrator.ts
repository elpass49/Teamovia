/**
 * Routes : Orchestration + Handoff inter-agents
 *
 * POST /orchestrator/handoff
 *   → reçoit session_id, target_agent, context
 *   → crée le lead dans sales si target = 'sales'
 *   → met à jour sessions.status = 'transferred'
 *   → insère dans handoffs
 *   → déclenche n8n webhook 'agent-handoff'
 */

import { Hono }                from 'hono'
import { zValidator }          from '@hono/zod-validator'
import { z }                   from 'zod'
import { createClient }        from '@supabase/supabase-js'
import { writeAgentLog }       from '@teamovia/agents-sdk'
import { triggerN8nWebhook }   from '@teamovia/agents-sdk'
import {
  workspaceMiddleware,
  type WorkspaceContext,
} from '../middleware/validate-workspace'

// ─────────────────────────────────────────────────────────────
// Schémas de validation
// ─────────────────────────────────────────────────────────────

const HandoffSchema = z.object({
  session_id:    z.string().uuid('Session ID invalide'),
  target_agent:  z.enum(['support', 'sales', 'human']),
  context:       z.record(z.unknown()).optional().default({}),
})

export type HandoffRequest = z.infer<typeof HandoffSchema>

export type HandoffResponse = {
  handoff_id: string
  lead_id:    string | null
  status:     'pending' | 'completed' | 'failed'
}

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

/** Récupère la session + contexte partagé */
async function getSession(
  sessionId: string,
  workspaceId: string
): Promise<{
  id:              string
  agent_id:        string
  user_ref:        string | null
  status:          string
  shared_context:  Record<string, unknown>
  session_context: Record<string, unknown>
  channel:         string
} | null> {
  const supabase = serverClient()

  const { data, error } = await supabase
    .from('sessions')
    .select('id, agent_id, user_ref, status, shared_context, session_context, channel')
    .eq('id', sessionId)
    .eq('workspace_id', workspaceId)
    .single()

  if (error || !data) return null
  return data as any
}

/** Récupère les messages de la session pour résumé */
async function getSessionMessages(sessionId: string, limit = 10): Promise<Array<{
  role:    'user' | 'assistant'
  content: string
}>> {
  const supabase = serverClient()

  const { data, error } = await supabase
    .from('messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) return []
  return (data ?? []) as any
}

/** Résume une conversation en texte court */
function summarizeMessages(messages: Array<{ role: string; content: string }>): string {
  if (messages.length === 0) return ''

  const lastUserMsg = messages
    .reverse()
    .find(m => m.role === 'user')?.content ?? ''

  return lastUserMsg.slice(0, 200)
}

/** Extrait les données lead depuis shared_context ou user_ref */
function extractLeadData(session: any): {
  email:    string
  name:     string
  company?: string
  phone?:   string
} {
  const shared = session.shared_context ?? {}

  return {
    email:   (shared.email as string) || session.user_ref || 'unknown@example.com',
    name:    (shared.name as string) || (shared.prospect_name as string) || 'Prospect',
    company: (shared.company as string) || undefined,
    phone:   (shared.phone as string) || undefined,
  }
}

// ─────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────

export const orchestratorRoute = new Hono()

orchestratorRoute.post(
  '/handoff',
  workspaceMiddleware(),
  zValidator('json', HandoffSchema),
  async (c) => {
    const ctx  = c.get('workspace') as WorkspaceContext
    const body = c.req.valid('json')

    const supabase = serverClient()

    // ── 1. Récupérer la session ──────────────────────────────
    const session = await getSession(body.session_id, ctx.workspaceId)
    if (!session) {
      return c.json(
        { error: 'Session introuvable', code: 'SESSION_NOT_FOUND' },
        404
      )
    }

    // ── 2. Récupérer les messages pour résumé ────────────────
    const messages = await getSessionMessages(body.session_id)
    const summary = summarizeMessages(messages)

    // ── 3. Créer le lead si target = 'sales' ─────────────────
    let leadId: string | null = null

    if (body.target_agent === 'sales') {
      const leadData = extractLeadData(session)

      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .insert({
          workspace_id: ctx.workspaceId,
          session_id:   body.session_id,
          email:        leadData.email,
          name:         leadData.name,
          company:      leadData.company ?? null,
          phone:        leadData.phone ?? null,
          source:       'handoff',
          status:       'new',
          data:         {
            ...body.context,
            handoff_summary: summary,
          },
        })
        .select('id')
        .single()

      if (leadError || !lead) {
        return c.json(
          { error: 'Erreur création lead', code: 'LEAD_CREATE_ERROR' },
          500
        )
      }

      leadId = lead.id
    }

    // ── 4. Mettre à jour la session ──────────────────────────
    const { error: sessionUpdateError } = await supabase
      .from('sessions')
      .update({
        status:     'transferred',
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.session_id)
      .eq('workspace_id', ctx.workspaceId)

    if (sessionUpdateError) {
      console.error('[orchestrator] Session update failed:', sessionUpdateError)
    }

    // ── 5. Créer le record handoff ───────────────────────────
    const { data: handoff, error: handoffError } = await supabase
      .from('handoffs')
      .insert({
        workspace_id:      ctx.workspaceId,
        source_session_id: body.session_id,
        source_agent_id:   session.agent_id,
        target_agent:      body.target_agent === 'sales' ? 'sales' : body.target_agent === 'support' ? 'support' : 'human',
        target_agent_id:   null,  // sera rempli par n8n/admin si target spécifique
        lead_id:           leadId,
        status:            'pending',
        context: {
          summary,
          user_ref: session.user_ref,
          ...body.context,
        },
        reason: body.context?.reason as string | undefined,
      })
      .select('id')
      .single()

    if (handoffError || !handoff) {
      return c.json(
        { error: 'Erreur création handoff', code: 'HANDOFF_CREATE_ERROR' },
        500
      )
    }

    // ── 6. Déclencher le webhook n8n ─────────────────────────
    triggerN8nWebhook('agent-handoff', {
      workspace_id:      ctx.workspaceId,
      session_id:        body.session_id,
      handoff_id:        handoff.id,
      target_agent:      body.target_agent,
      lead_id:           leadId,
      context:           body.context,
      source_agent_id:   session.agent_id,
      summary,
    }).catch(err => console.warn('[n8n] handoff webhook failed:', err))

    // ── 7. Log l'événement ───────────────────────────────────
    await writeAgentLog(
      ctx.workspaceId,
      session.agent_id,
      body.session_id,
      'handoff',
      {
        handoff_id:   handoff.id,
        target_agent: body.target_agent,
        lead_id:      leadId,
      }
    )

    return c.json({
      handoff_id: handoff.id,
      lead_id:    leadId,
      status:     'pending',
    })
  }
)
