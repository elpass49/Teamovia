/**
 * createAgentRunner
 * Pipeline principal d'exécution d'un agent.
 *
 * Ordre d'exécution :
 *   1. Récupérer le contexte (session ou lead) + mémoire agent
 *   2. Vectoriser le message entrant
 *   3. Rechercher dans la KB (RAG)
 *   4. Construire le prompt système avec les variables injectées
 *   5. Récupérer l'historique des messages de la session
 *   6. Appeler le LLM (AI SDK 7 + Anthropic)
 *   7. Persister le message assistant
 *   8. Logger l'événement
 *   9. Détecter et déclencher les actions post-réponse
 */

import { generateText }          from 'ai'
import { anthropic }             from '@ai-sdk/anthropic'
import { createClient }          from '@supabase/supabase-js'
import { embedText }             from './embeddings'
import { matchKnowledge,
         formatChunksForPrompt } from './knowledge'
import { writeAgentLog }         from './logs'
import { getAgentMemory,
         formatMemoryForPrompt } from './memory'
import { triggerN8nWebhook }     from './n8n'
import { buildSystemPrompt }     from '@teamovia/prompts'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type AgentRunnerOptions = {
  agentType:    'support' | 'sales'
  agentId:      string
  workspaceId:  string
  workspaceName: string
  sessionId?:   string   // support
  leadId?:      string   // sales
  userRef?:     string   // identifiant externe de l'utilisateur final
  userMessage:  string
}

export type AgentRunnerResult = {
  text:             string
  tokensUsed:       number
  latencyMs:        number
  actionTriggered:  'HANDOFF_TO_SALES' | 'ESCALATE_TO_HUMAN' | null
}

type DbMessage = {
  role:    'user' | 'assistant' | 'system'
  content: string
}

// ─────────────────────────────────────────────────────────────
// Helpers internes
// ─────────────────────────────────────────────────────────────

/** Client Supabase server-side (bypass RLS) */
function serverClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/** Récupère les N derniers messages d'une session pour le contexte LLM */
async function getSessionMessages(
  sessionId: string,
  limit = 20
): Promise<DbMessage[]> {
  const supabase = serverClient()

  const { data, error } = await supabase
    .from('messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) throw new Error(`getSessionMessages error: ${error.message}`)
  return (data ?? []) as DbMessage[]
}

/** Récupère le contexte d'une session */
async function getSessionContext(sessionId: string): Promise<{
  channel:        string
  status:         string
  sessionContext: Record<string, unknown>
  sharedContext:  Record<string, unknown>
}> {
  const supabase = serverClient()

  const { data, error } = await supabase
    .from('sessions')
    .select('channel, status, session_context, shared_context')
    .eq('id', sessionId)
    .single()

  if (error || !data) throw new Error(`Session introuvable : ${sessionId}`)

  return {
    channel:        data.channel as string,
    status:         data.status  as string,
    sessionContext: (data.session_context as Record<string, unknown>) ?? {},
    sharedContext:  (data.shared_context  as Record<string, unknown>) ?? {},
  }
}

/** Persiste un message dans la table messages */
async function saveMessage(
  sessionId:  string,
  role:       'user' | 'assistant',
  content:    string,
  tokensUsed: number | null = null,
  latencyMs:  number | null = null
): Promise<void> {
  const supabase = serverClient()

  const { error } = await supabase.from('messages').insert({
    session_id:  sessionId,
    role,
    content,
    tokens_used: tokensUsed,
    latency_ms:  latencyMs,
  })

  if (error) throw new Error(`saveMessage error: ${error.message}`)
}

// ─────────────────────────────────────────────────────────────
// Détection d'actions post-réponse
// ─────────────────────────────────────────────────────────────

/**
 * Détecte si la réponse de l'agent indique une intention commerciale.
 * Cherche les marqueurs textuels que le prompt système est configuré à produire.
 */
function detectSalesHandoff(text: string): boolean {
  const markers = [
    'HANDOFF_TO_SALES',
    'transmets à l\'équipe en charge des ventes',
    'transmets à l\'équipe commerciale',
  ]
  return markers.some(m => text.includes(m))
}

/**
 * Détecte si la réponse de l'agent indique une escalade vers un humain.
 */
function detectEscalation(text: string): boolean {
  const markers = [
    'ESCALATE_TO_HUMAN',
    'nécessite l\'intervention d\'un membre',
    'viens de transmettre votre dossier',
  ]
  return markers.some(m => text.includes(m))
}

// ─────────────────────────────────────────────────────────────
// Runner principal
// ─────────────────────────────────────────────────────────────

export async function createAgentRunner(
  options: AgentRunnerOptions
): Promise<AgentRunnerResult> {
  const {
    agentType,
    agentId,
    workspaceId,
    workspaceName,
    sessionId,
    userRef,
    userMessage,
  } = options

  const startTime = Date.now()

  // ── 1. Contexte de session ──────────────────────────────────
  const sessionCtx = sessionId
    ? await getSessionContext(sessionId)
    : null

  // ── 2. Mémoire agent ────────────────────────────────────────
  const memory = userRef
    ? await getAgentMemory(workspaceId, agentId, userRef)
    : null

  // ── 3. RAG — vectorisation + recherche KB ──────────────────
  const embedding = await embedText(userMessage)
  const chunks    = await matchKnowledge(
    embedding,
    workspaceId,
    agentId,
    5,    // max 5 chunks
    0.5   // similarité minimum
  )

  // Log de l'appel entrant (avant la réponse)
  await writeAgentLog(
    workspaceId, agentId, sessionId ?? null,
    'message_in',
    {
      content_length: userMessage.length,
      channel:        sessionCtx?.channel ?? 'unknown',
      kb_chunks_found: chunks.length,
    }
  )

  // ── 4. Prompt système ────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(agentType, {
    COMPANY_NAME:       workspaceName,
    WORKSPACE_ID:       workspaceId,
    CHANNEL:            sessionCtx?.channel,
    CURRENT_DATETIME:   new Date().toISOString(),
    TICKET_STATUS:      sessionCtx?.sessionContext?.ticket_status as string | undefined,
    AGENT_MEMORY:       formatMemoryForPrompt(memory),
    KB_CHUNKS:          formatChunksForPrompt(chunks),
    ESCALATION_TEAM:    'notre équipe', // TODO : lire depuis workspaces.escalation_config
    HANDOFF_CONTEXT:    undefined,
    LEAD_MEMORY:        undefined,
    LEAD_SOURCE:        undefined,
    LEAD_STATUS:        undefined,
    LEAD_SCORE:         undefined,
  })

  // ── 5. Historique des messages ──────────────────────────────
  const history = sessionId
    ? await getSessionMessages(sessionId, 20)
    : []

  // Construire les messages pour le LLM
  // Le message utilisateur courant est ajouté à la fin
  const llmMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...history
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: userMessage },
  ]

  // ── 6. Appel LLM (AI SDK 7) ─────────────────────────────────
  const model     = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'
  const maxTokens = 1024

  const { text, usage } = await generateText({
    model:      anthropic(model),
    system:     systemPrompt,
    messages:   llmMessages,
    maxTokens,
  })

  const latencyMs  = Date.now() - startTime
  const tokensUsed = (usage?.totalTokens ?? 0)

  // ── 7. Persistance des messages ─────────────────────────────
  if (sessionId) {
    // Persister d'abord le message utilisateur
    await saveMessage(sessionId, 'user', userMessage)
    // Puis la réponse assistant avec les métriques
    await saveMessage(sessionId, 'assistant', text, tokensUsed, latencyMs)
  }

  // ── 8. Détection des actions ─────────────────────────────────
  let actionTriggered: AgentRunnerResult['actionTriggered'] = null

  if (agentType === 'support') {
    if (detectSalesHandoff(text)) {
      actionTriggered = 'HANDOFF_TO_SALES'
      // Déclencher le workflow n8n de handoff (fire-and-forget)
      triggerN8nWebhook('agent-handoff', {
        session_id:   sessionId,
        workspace_id: workspaceId,
        target:       'sales',
        context: {
          summary:   `Prospect depuis session support ${sessionId}`,
          user_ref:  userRef,
        },
      }).catch(err => console.warn('[n8n] Handoff webhook failed:', err))

    } else if (detectEscalation(text)) {
      actionTriggered = 'ESCALATE_TO_HUMAN'
      triggerN8nWebhook('support-escalate', {
        session_id:   sessionId,
        workspace_id: workspaceId,
        priority:     'high',
      }).catch(err => console.warn('[n8n] Escalate webhook failed:', err))
    }
  }

  // ── 9. Log de la réponse ─────────────────────────────────────
  await writeAgentLog(
    workspaceId, agentId, sessionId ?? null,
    'message_out',
    {
      kb_chunks_used:   chunks.length,
      action_triggered: actionTriggered,
    },
    { latencyMs, tokensUsed, modelUsed: model }
  )

  return { text, tokensUsed, latencyMs, actionTriggered }
}
