/**
 * Routes : Agent Ops Sara
 *
 * POST /agents/sara/escalate       → notifie l'opérateur (session escaladée)
 * POST /agents/sara/lead-qualified → onboarding lead qualifié
 * POST /agents/sara/lead-followup  → relance lead inactif
 * GET  /agents/sara/workflows      → liste des workflows Sara avec statut
 */

import { Hono }         from 'hono'
import { zValidator }   from '@hono/zod-validator'
import { z }            from 'zod'
import { createClient } from '@supabase/supabase-js'
import {
  workspaceMiddleware,
  type WorkspaceContext,
} from '../../middleware/validate-workspace.js'

// ─────────────────────────────────────────────────────────────
// Config workflows n8n Sara
// ─────────────────────────────────────────────────────────────

const N8N_WORKFLOWS = {
  escalation:    { path: 'teamovia-escalation',    id: 'D44yZWmM0oG6Sx6b' },
  leadQualified: { path: 'teamovia-lead-qualified', id: '3lkm9scvJxdW0Psj' },
  leadFollowup:  { path: 'teamovia-lead-followup',  id: 'e6nnYTIJBZQ6MSSR' },
}

// ─────────────────────────────────────────────────────────────
// Schémas
// ─────────────────────────────────────────────────────────────

const EscalateSchema = z.object({
  session_id:   z.string().uuid(),
  priority:     z.enum(['low', 'normal', 'high']).default('normal'),
  reason:       z.string().optional(),
})

const LeadQualifiedSchema = z.object({
  lead_id:        z.string().uuid(),
  lead_name:      z.string(),
  lead_email:     z.string().email().optional(),
  score:          z.number().int().min(0).max(100),
  source:         z.string().optional(),
  project:        z.string().optional(),
  workspace_name: z.string().optional(),
})

const LeadFollowupSchema = z.object({
  lead_id:        z.string().uuid(),
  lead_name:      z.string(),
  lead_email:     z.string().email().optional(),
  days_idle:      z.number().int().min(1).default(3),
  status:         z.string().optional(),
  score:          z.number().optional(),
  workspace_name: z.string().optional(),
})

// ─────────────────────────────────────────────────────────────
// Helper — appel webhook n8n
// ─────────────────────────────────────────────────────────────

function serverClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function triggerN8nWorkflow(
  workflowPath: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const baseUrl = process.env.N8N_BASE_URL
  if (!baseUrl) {
    console.warn('[sara] N8N_BASE_URL non configuré')
    return { success: false, error: 'N8N_BASE_URL manquant' }
  }

  try {
    const res = await fetch(`${baseUrl}/webhook/${workflowPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': process.env.N8N_WEBHOOK_SECRET ?? '',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error(`[sara] Webhook ${workflowPath} failed: ${res.status} — ${err}`)
      return { success: false, error: `HTTP ${res.status}` }
    }

    console.log(`[sara] Webhook ${workflowPath} triggered ✓`)
    return { success: true }
  } catch (err) {
    console.error(`[sara] Webhook ${workflowPath} error:`, err)
    return { success: false, error: String(err) }
  }
}

async function logSaraAction(
  workspaceId: string,
  action: string,
  payload: Record<string, unknown>,
  success: boolean
) {
  const supabase = serverClient()
  await supabase.from('agent_logs').insert({
    workspace_id: workspaceId,
    event_type:   'tool_call',
    payload: { agent: 'sara', action, ...payload, success },
  }).catch(err => console.warn('[sara] log error:', err))
}

// ─────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────

export const saraRoute = new Hono()

// ── POST /escalate ───────────────────────────────────────────

saraRoute.post(
  '/escalate',
  workspaceMiddleware(),
  zValidator('json', EscalateSchema),
  async (c) => {
    const ctx  = c.get('workspace') as WorkspaceContext
    const body = c.req.valid('json')

    const result = await triggerN8nWorkflow(N8N_WORKFLOWS.escalation.path, {
      session_id:    body.session_id,
      workspace_id:  ctx.workspaceId,
      workspace_name: ctx.workspaceName,
      priority:      body.priority,
      reason:        body.reason ?? 'Non précisée',
    })

    await logSaraAction(ctx.workspaceId, 'escalation', { session_id: body.session_id, priority: body.priority }, result.success)

    return c.json({
      action:  'escalation',
      success: result.success,
      error:   result.error ?? null,
      workflow: N8N_WORKFLOWS.escalation.id,
    })
  }
)

// ── POST /lead-qualified ─────────────────────────────────────

saraRoute.post(
  '/lead-qualified',
  workspaceMiddleware(),
  zValidator('json', LeadQualifiedSchema),
  async (c) => {
    const ctx  = c.get('workspace') as WorkspaceContext
    const body = c.req.valid('json')

    const result = await triggerN8nWorkflow(N8N_WORKFLOWS.leadQualified.path, {
      ...body,
      workspace_id:   ctx.workspaceId,
      workspace_name: body.workspace_name ?? ctx.workspaceName,
    })

    await logSaraAction(ctx.workspaceId, 'lead_qualified', { lead_id: body.lead_id, score: body.score }, result.success)

    return c.json({
      action:  'lead_qualified',
      success: result.success,
      error:   result.error ?? null,
      workflow: N8N_WORKFLOWS.leadQualified.id,
    })
  }
)

// ── POST /lead-followup ──────────────────────────────────────

saraRoute.post(
  '/lead-followup',
  workspaceMiddleware(),
  zValidator('json', LeadFollowupSchema),
  async (c) => {
    const ctx  = c.get('workspace') as WorkspaceContext
    const body = c.req.valid('json')

    const result = await triggerN8nWorkflow(N8N_WORKFLOWS.leadFollowup.path, {
      ...body,
      workspace_id:   ctx.workspaceId,
      workspace_name: body.workspace_name ?? ctx.workspaceName,
    })

    await logSaraAction(ctx.workspaceId, 'lead_followup', { lead_id: body.lead_id, days_idle: body.days_idle }, result.success)

    return c.json({
      action:  'lead_followup',
      success: result.success,
      error:   result.error ?? null,
      workflow: N8N_WORKFLOWS.leadFollowup.id,
    })
  }
)

// ── GET /workflows ───────────────────────────────────────────

saraRoute.get(
  '/workflows',
  workspaceMiddleware(),
  async (c) => {
    return c.json({
      workflows: [
        {
          id:          N8N_WORKFLOWS.escalation.id,
          name:        'Notification Escalade',
          description: 'Alerte l\'opérateur quand une session est escaladée',
          trigger:     'POST /agents/sara/escalate',
          n8n_url:     `https://n8n.sportnest.fr/workflow/${N8N_WORKFLOWS.escalation.id}`,
        },
        {
          id:          N8N_WORKFLOWS.leadQualified.id,
          name:        'Onboarding Lead Qualifié',
          description: 'Notifie l\'équipe et confirme au prospect quand un lead est qualifié',
          trigger:     'POST /agents/sara/lead-qualified',
          n8n_url:     `https://n8n.sportnest.fr/workflow/${N8N_WORKFLOWS.leadQualified.id}`,
        },
        {
          id:          N8N_WORKFLOWS.leadFollowup.id,
          name:        'Relance Lead',
          description: 'Alerte l\'équipe et relance le prospect quand un lead est inactif',
          trigger:     'POST /agents/sara/lead-followup',
          n8n_url:     `https://n8n.sportnest.fr/workflow/${N8N_WORKFLOWS.leadFollowup.id}`,
        },
      ]
    })
  }
)
