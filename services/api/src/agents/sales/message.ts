/**
 * Routes : Agent Ventes
 *
 * POST   /leads              → créer un lead
 * POST   /leads/:id/message  → message qualification + auto-score
 * GET    /leads              → liste avec filtres
 * GET    /leads/:id          → fiche + messages + sync logs
 * PATCH  /leads/:id          → mise à jour manuelle
 * POST   /leads/:id/qualify  → déclenche qualifyLead()
 * POST   /leads/:id/sync-crm → push vers CRM (n8n)
 */

import { Hono }                from 'hono'
import { zValidator }          from '@hono/zod-validator'
import { z }                   from 'zod'
import { createClient }        from '@supabase/supabase-js'
import { qualifyLead }         from './qualify.js'
import { writeAgentLog }       from '@teamovia/agents-sdk'
import { triggerN8nWebhook }   from '@teamovia/agents-sdk'
import {
  workspaceMiddleware,
  type WorkspaceContext,
} from '../../middleware/validate-workspace.js'

// ─────────────────────────────────────────────────────────────
// Schémas de validation
// ─────────────────────────────────────────────────────────────

const CreateLeadSchema = z.object({
  email:    z.string().email('Email invalide'),
  name:     z.string().min(1, 'Nom requis'),
  company:  z.string().optional(),
  phone:    z.string().optional(),
  source:   z.enum(['form', 'chat', 'email', 'handoff', 'import']).default('form'),
  data:     z.record(z.unknown()).optional().default({}),
})

const LeadMessageSchema = z.object({
  content:  z.string().min(1, 'Message vide').max(4000, 'Message trop long'),
  metadata: z.record(z.unknown()).optional().default({}),
})

const UpdateLeadSchema = z.object({
  status:      z.enum(['new', 'qualifying', 'qualified', 'transferred', 'lost']).optional(),
  assigned_to: z.string().uuid().optional().nullable(),
  data:        z.record(z.unknown()).optional(),
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

async function validateLead(
  leadId: string,
  workspaceId: string
): Promise<{ id: string; score: number | null; data: Record<string, unknown> } | null> {
  const supabase = serverClient()
  const { data, error } = await supabase
    .from('leads')
    .select('id, score, data')
    .eq('id', leadId)
    .eq('workspace_id', workspaceId)
    .single()

  if (error || !data) return null
  return data as { id: string; score: number | null; data: Record<string, unknown> }
}

async function getLeadFull(leadId: string, workspaceId: string): Promise<{
  lead: Record<string, unknown>
  messages: Record<string, unknown>[]
  syncLogs: Record<string, unknown>[]
} | null> {
  const supabase = serverClient()

  const [leadRes, messagesRes, syncRes] = await Promise.all([
    supabase.from('leads').select('*').eq('id', leadId).eq('workspace_id', workspaceId).single(),
    supabase.from('lead_messages').select('*').eq('lead_id', leadId).order('created_at', { ascending: true }),
    supabase.from('crm_sync_log').select('*').eq('lead_id', leadId).order('synced_at', { ascending: false }).limit(10),
  ])

  if (leadRes.error || !leadRes.data) return null

  return {
    lead:     leadRes.data as Record<string, unknown>,
    messages: (messagesRes.data ?? []) as Record<string, unknown>[],
    syncLogs: (syncRes.data ?? []) as Record<string, unknown>[],
  }
}

// ─────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────

export const salesRoute = new Hono()

// ── POST /leads ──────────────────────────────────────────────

salesRoute.post(
  '/leads',
  workspaceMiddleware({ quota: 'leads' }),
  zValidator('json', CreateLeadSchema),
  async (c) => {
    const ctx  = c.get('workspace') as WorkspaceContext
    const body = c.req.valid('json')

    const supabase = serverClient()
    const { data: lead, error } = await supabase
      .from('leads')
      .insert({
        workspace_id: ctx.workspaceId,
        email:        body.email,
        name:         body.name,
        company:      body.company ?? null,
        phone:        body.phone ?? null,
        source:       body.source,
        data:         body.data,
        status:       'new',
      })
      .select()
      .single()

    if (error || !lead) {
      console.error('[sales/leads] create error:', error)
      return c.json({ error: 'Erreur création lead', code: 'CREATE_ERROR' }, 500)
    }

    await writeAgentLog(ctx.workspaceId, null, null, 'message_in', {
      event: 'lead_created', lead_id: lead.id, source: body.source,
    })

    return c.json(lead, 201)
  }
)

// ── POST /leads/:id/message ──────────────────────────────────

salesRoute.post(
  '/leads/:id/message',
  workspaceMiddleware(),
  zValidator('json', LeadMessageSchema),
  async (c) => {
    const ctx    = c.get('workspace') as WorkspaceContext
    const leadId = c.req.param('id')
    const body   = c.req.valid('json')

    const lead = await validateLead(leadId, ctx.workspaceId)
    if (!lead) {
      return c.json({ error: 'Lead introuvable', code: 'LEAD_NOT_FOUND' }, 404)
    }

    const supabase = serverClient()
    const { data: message, error } = await supabase
      .from('lead_messages')
      .insert({
        lead_id:  leadId,
        role:     'user',
        content:  body.content,
        metadata: body.metadata,
      })
      .select()
      .single()

    if (error || !message) {
      console.error('[sales/message] insert error:', error)
      return c.json({ error: 'Erreur création message', code: 'MESSAGE_ERROR' }, 500)
    }

    await writeAgentLog(ctx.workspaceId, null, null, 'message_in', {
      event: 'lead_message_received', lead_id: leadId, content_length: body.content.length,
    })

    const shouldAutoQualify =
      lead.data &&
      typeof lead.data === 'object' &&
      Object.keys(lead.data).length >= 3

    let qualification = null
    if (shouldAutoQualify && !lead.score) {
      try {
        qualification = await qualifyLead(leadId, ctx.workspaceId, ctx.workspaceName)
      } catch (err) {
        console.warn('[sales/message] Auto-qualify failed:', err)
      }
    }

    return c.json({ message, qualification: qualification ?? null }, 201)
  }
)

// ── GET /leads ───────────────────────────────────────────────

salesRoute.get(
  '/leads',
  workspaceMiddleware(),
  async (c) => {
    const ctx      = c.get('workspace') as WorkspaceContext
    const status   = c.req.query('status')
    const source   = c.req.query('source')
    const minScore = c.req.query('min_score') ? Number(c.req.query('min_score')) : null
    const assignedTo = c.req.query('assigned_to')
    const sort     = c.req.query('sort') ?? 'created_at'
    const order    = c.req.query('order') ?? 'desc'
    const page     = Number(c.req.query('page') ?? 1)
    const perPage  = Math.min(Number(c.req.query('per_page') ?? 20), 100)

    const supabase = serverClient()
    let query = supabase
      .from('leads')
      .select('*', { count: 'exact' })
      .eq('workspace_id', ctx.workspaceId)
      .order(sort, { ascending: order === 'asc' })
      .range((page - 1) * perPage, page * perPage - 1)

    if (status)          query = query.eq('status', status)
    if (source)          query = query.eq('source', source)
    if (minScore !== null) query = query.gte('score', minScore)
    if (assignedTo)      query = query.eq('assigned_to', assignedTo)

    const { data, error, count } = await query

    if (error) {
      return c.json({ error: error.message, code: 'DB_ERROR' }, 500)
    }

    return c.json({
      leads: data ?? [],
      pagination: {
        total: count ?? 0, page, per_page: perPage,
        has_more: (count ?? 0) > page * perPage,
      },
    })
  }
)

// ── GET /leads/:id ───────────────────────────────────────────

salesRoute.get(
  '/leads/:id',
  workspaceMiddleware(),
  async (c) => {
    const ctx    = c.get('workspace') as WorkspaceContext
    const leadId = c.req.param('id')

    const full = await getLeadFull(leadId, ctx.workspaceId)
    if (!full) {
      return c.json({ error: 'Lead introuvable', code: 'LEAD_NOT_FOUND' }, 404)
    }

    return c.json(full)
  }
)

// ── PATCH /leads/:id ─────────────────────────────────────────

salesRoute.patch(
  '/leads/:id',
  workspaceMiddleware(),
  zValidator('json', UpdateLeadSchema),
  async (c) => {
    const ctx    = c.get('workspace') as WorkspaceContext
    const leadId = c.req.param('id')
    const body   = c.req.valid('json')

    const lead = await validateLead(leadId, ctx.workspaceId)
    if (!lead) {
      return c.json({ error: 'Lead introuvable', code: 'LEAD_NOT_FOUND' }, 404)
    }

    const supabase = serverClient()
    const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (body.status !== undefined)      updatePayload.status = body.status
    if (body.assigned_to !== undefined) updatePayload.assigned_to = body.assigned_to
    if (body.data !== undefined)        updatePayload.data = { ...(lead.data ?? {}), ...body.data }

    const { data: updated, error } = await supabase
      .from('leads')
      .update(updatePayload)
      .eq('id', leadId)
      .eq('workspace_id', ctx.workspaceId)
      .select()
      .single()

    if (error || !updated) {
      return c.json({ error: 'Erreur mise à jour', code: 'UPDATE_ERROR' }, 500)
    }

    return c.json(updated)
  }
)

// ── POST /leads/:id/qualify ──────────────────────────────────

salesRoute.post(
  '/leads/:id/qualify',
  workspaceMiddleware(),
  async (c) => {
    const ctx    = c.get('workspace') as WorkspaceContext
    const leadId = c.req.param('id')

    const lead = await validateLead(leadId, ctx.workspaceId)
    if (!lead) {
      return c.json({ error: 'Lead introuvable', code: 'LEAD_NOT_FOUND' }, 404)
    }

    let result
    try {
      result = await qualifyLead(leadId, ctx.workspaceId, ctx.workspaceName)
    } catch (err) {
      console.error('[sales/qualify] Error:', err)
      return c.json({ error: 'Erreur qualification', code: 'QUALIFY_ERROR' }, 500)
    }

    return c.json(result)
  }
)

// ── POST /leads/:id/sync-crm ────────────────────────────────

salesRoute.post(
  '/leads/:id/sync-crm',
  workspaceMiddleware(),
  async (c) => {
    const ctx    = c.get('workspace') as WorkspaceContext
    const leadId = c.req.param('id')

    const full = await getLeadFull(leadId, ctx.workspaceId)
    if (!full) {
      return c.json({ error: 'Lead introuvable', code: 'LEAD_NOT_FOUND' }, 404)
    }

    triggerN8nWebhook('lead-crm-sync', {
      workspace_id: ctx.workspaceId,
      lead_id:      leadId,
      lead:         full.lead,
      messages:     full.messages,
    }).catch(err => console.warn('[n8n] sync-crm webhook failed:', err))

    await writeAgentLog(ctx.workspaceId, null, null, 'crm_sync', {
      event: 'crm_sync_triggered', lead_id: leadId,
    })

    return c.json({ status: 'queued', lead_id: leadId, message: 'Synchronisation CRM en cours...' })
  }
)
