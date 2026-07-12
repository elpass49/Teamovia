/**
 * qualifyLead
 * Lance l'agent de qualification de lead avec structured output.
 *
 * Flux :
 *   1. Récupérer le lead + historique messages de qualification
 *   2. Vectoriser les données collectées
 *   3. Rechercher chunks KB pertinents (contexte produit)
 *   4. Appeler LLM avec schéma structuré LeadScore
 *   5. Parser la réponse JSON
 *   6. Persister score + score_data
 *   7. Retourner le score
 */

import { generateObject }      from 'ai'
import { anthropic }           from '@ai-sdk/anthropic'
import { createClient }        from '@supabase/supabase-js'
import { z }                   from 'zod'
import { embedText }           from '@teamovia/agents-sdk'
import { matchKnowledge,
         formatChunksForPrompt } from '@teamovia/agents-sdk'
import { writeAgentLog }       from '@teamovia/agents-sdk'
import { buildSystemPrompt }   from '@teamovia/prompts'

// ─────────────────────────────────────────────────────────────
// Types et schémas
// ─────────────────────────────────────────────────────────────

const LeadScoreSchema = z.object({
  overall_score: z.number()
    .min(0)
    .max(100)
    .describe('Score global 0-100'),
  dimensions: z.object({
    need: z.number().min(0).max(100).describe('Besoin identifié'),
    budget: z.number().min(0).max(100).describe('Capacité budgétaire'),
    timeline: z.number().min(0).max(100).describe('Urgence/timeline'),
    decision_maker: z.number().min(0).max(100).describe('Pouvoir décisionnel'),
  }).describe('Scores par dimension'),
  reasons: z.array(z.string()).describe('Raisons du score'),
  disqualifiers: z.array(z.string()).describe('Raisons de rejet potentiel'),
  recommended_action: z.enum(['qualify', 'nurture', 'disqualify'])
    .describe('Action recommandée'),
  next_step: z.string().describe('Prochaine étape'),
})

export type LeadScore = z.infer<typeof LeadScoreSchema>

export type QualifyResult = {
  leadId:    string
  score:     number
  scoreData: LeadScore
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

/** Récupère le lead + données complètes */
async function getLead(
  leadId: string,
  workspaceId: string
): Promise<{
  id:       string
  email:    string
  name:     string
  company:  string
  phone:    string
  source:   string
  data:     Record<string, unknown>
} | null> {
  const supabase = serverClient()

  const { data, error } = await supabase
    .from('leads')
    .select('id, email, name, company, phone, source, data')
    .eq('id', leadId)
    .eq('workspace_id', workspaceId)
    .single()

  if (error || !data) return null
  return data as any
}

/** Récupère les messages de qualification d'un lead */
async function getLeadMessages(leadId: string, limit = 10): Promise<Array<{
  role:    'user' | 'assistant'
  content: string
}>> {
  const supabase = serverClient()

  const { data, error } = await supabase
    .from('lead_messages')
    .select('role, content')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) return []
  return (data ?? []) as any
}

// ─────────────────────────────────────────────────────────────
// Fonction principale
// ─────────────────────────────────────────────────────────────

export async function qualifyLead(
  leadId:      string,
  workspaceId: string,
  workspaceName: string
): Promise<QualifyResult> {
  const startTime = Date.now()
  const supabase = serverClient()

  // ── 1. Récupérer le lead ─────────────────────────────────
  const lead = await getLead(leadId, workspaceId)
  if (!lead) {
    throw new Error(`Lead introuvable : ${leadId}`)
  }

  // ── 2. Récupérer l'historique de messages ────────────────
  const messages = await getLeadMessages(leadId)

  // ── 3. Vectorisation des données du lead pour KB search ───
  const leadContext = `
    Email: ${lead.email}
    Entreprise: ${lead.company}
    Source: ${lead.source}
    Données: ${JSON.stringify(lead.data)}
  `

  const embedding = await embedText(leadContext)
  const chunks = await matchKnowledge(
    embedding,
    workspaceId,
    undefined,  // chunks partagés (pas d'agent spécifique)
    5,
    0.5
  )

  // ── 4. Construire le prompt système ──────────────────────
  const systemPrompt = buildSystemPrompt('sales', {
    COMPANY_NAME:       workspaceName,
    WORKSPACE_ID:       workspaceId,
    CHANNEL:            'lead_qualification',
    CURRENT_DATETIME:   new Date().toISOString(),
    KB_CHUNKS:          formatChunksForPrompt(chunks),
    AGENT_MEMORY:       '',
    ESCALATION_TEAM:    'notre équipe',
    HANDOFF_CONTEXT:    undefined,
    LEAD_MEMORY:        undefined,
    LEAD_SOURCE:        lead.source,
    LEAD_STATUS:        undefined,
    LEAD_SCORE:         undefined,
  })

  const userMessage = `
Qualifie ce lead sur la base des informations collectées et de la conversation.

**Données du lead :**
- Email: ${lead.email}
- Nom: ${lead.name}
- Entreprise: ${lead.company}
- Téléphone: ${lead.phone}
- Source: ${lead.source}
- Données customs: ${JSON.stringify(lead.data, null, 2)}

**Historique de conversation :**
${messages.map(m => `${m.role === 'user' ? '👤' : '🤖'} ${m.content}`).join('\n')}

Évalue ce lead selon les dimensions : besoin, budget, timeline, pouvoir décisionnel.
Propose une action (qualify, nurture, disqualify) et la prochaine étape.
  `.trim()

  // ── 5. Appel LLM avec structured output ──────────────────
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'
  const maxTokens = 1024

  const { object: scoreData } = await generateObject({
    model:      anthropic(model),
    system:     systemPrompt,
    prompt:     userMessage,
    schema:     LeadScoreSchema,
    maxTokens,
  })

  const latencyMs = Date.now() - startTime

  // ── 6. Persister le score ────────────────────────────────
  const { error: updateError } = await supabase
    .from('leads')
    .update({
      score:       scoreData.overall_score,
      score_data:  scoreData,
      status:      scoreData.recommended_action === 'qualify' ? 'qualified'
                  : scoreData.recommended_action === 'disqualify' ? 'lost'
                  : 'qualifying',
      updated_at:  new Date().toISOString(),
    })
    .eq('id', leadId)
    .eq('workspace_id', workspaceId)

  if (updateError) {
    throw new Error(`Erreur mise à jour lead : ${updateError.message}`)
  }

  // ── 7. Log l'événement ───────────────────────────────────
  await writeAgentLog(
    workspaceId,
    null,  // pas d'agent_id pour les tâches batch
    null,
    'message_out',
    {
      event:               'lead_qualified',
      lead_id:             leadId,
      score:               scoreData.overall_score,
      recommended_action:  scoreData.recommended_action,
    },
    { latencyMs }
  )

  return {
    leadId,
    score: scoreData.overall_score,
    scoreData,
  }
}
