/**
 * createAgentRunner
 * Pipeline principal d'exécution d'un agent.
 * Supporte DeepSeek et Anthropic via LLM_PROVIDER env var.
 *
 * Ordre d'exécution :
 *   1. Récupérer le contexte (session ou lead) + mémoire agent
 *   2. Vectoriser le message entrant
 *   3. Rechercher dans la KB (RAG)
 *   4. Construire le prompt système avec les variables injectées
 *   5. Récupérer l'historique des messages de la session
 *   6. Appeler le LLM (DeepSeek ou Anthropic) ou mock si MOCK_LLM=true
 *   7. Persister le message assistant
 *   8. Logger l'événement
 *   9. Détecter et déclencher les actions post-réponse
 */

import { generateText }          from 'ai'
import { anthropic }             from '@ai-sdk/anthropic'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
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
// Provider LLM
// Configuré via LLM_PROVIDER=deepseek | anthropic dans .env.local
// ─────────────────────────────────────────────────────────────

function getLLMModel() {
  const provider = process.env.LLM_PROVIDER ?? 'anthropic'

  if (provider === 'deepseek') {
    const deepseek = createOpenAICompatible({
      name:    'deepseek',
      baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
      apiKey:  process.env.DEEPSEEK_API_KEY ?? '',
    })
    const model = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'
    console.log(`[runner] LLM provider: DeepSeek (${model})`)
    return { model: deepseek(model), modelId: `deepseek/${model}` }
  }

  // Défaut : Anthropic
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'
  console.log(`[runner] LLM provider: Anthropic (${model})`)
  return { model: anthropic(model), modelId: `anthropic/${model}` }
}

// ─────────────────────────────────────────────────────────────
// Mode MOCK_LLM
// Activé via MOCK_LLM=true dans .env.local
// ─────────────────────────────────────────────────────────────

function getMockResponse(agentType: 'support' | 'sales', userMessage: string): string {
  const preview = userMessage.slice(0, 60)

  if (agentType === 'support') {
    return `[MODE TEST] Bonjour, je vous réponds au nom de l'équipe support.\n\nVotre message "${preview}..." a bien été reçu.\n\nCeci est une réponse simulée — MOCK_LLM=true est activé.`
  }

  return `[MODE TEST] Merci pour votre message concernant "${preview}...".

\`\`\`json
{
  "score": 65,
  "confidence": "medium",
  "dimensions": {
    "besoin": 18,
    "budget": 15,
    "delai": 17,
    "decisionnaire": 15
  },
  "reasons": ["Besoin identifié", "Intention détectée", "Score simulé — MOCK_LLM=true"],
  "disqualifiers": [],
  "recommended_action": "nurture",
  "next_step": "Proposer un appel de découverte"
}
\`\`\`

Réponse simulée — MOCK_LLM=true activé.`
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type AgentRunnerOptions = {
  agentType:     'support' | 'sales'
  agentId:       string
  workspaceId:   string
  workspaceName: string
  sessionId?:    string
  leadId?:       string
  userRef?:      string
  userMessage:   string
}

export type AgentRunnerResult = {
  text:            string
  tokensUsed:      number
  latencyMs:       number
  actionTriggered: 'HANDOFF_TO_SALES' | 'ESCALATE_TO_HUMAN' | null
}

type DbMessage = {
  role:    'user' | 'assistant' | 'system'
  content: string
}

// ─────────────────────────────────────────────────────────────
// Helpers internes
// ─────────────────────────────────────────────────────────────

function serverClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function getSessionMessages(sessionId: string, limit = 20): Promise<DbMessage[]> {
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

function detectSalesHandoff(text: string): boolean {
  return [
    'HANDOFF_TO_SALES',
    "transmets à l'équipe en charge des ventes",
    "transmets à l'équipe commerciale",
  ].some(m => text.includes(m))
}

function detectEscalation(text: string): boolean {
  return [
    'ESCALATE_TO_HUMAN',
    "nécessite l'intervention d'un membre",
    'viens de transmettre votre dossier',
  ].some(m => text.includes(m))
}

// ─────────────────────────────────────────────────────────────
// Runner principal
// ─────────────────────────────────────────────────────────────

export async function createAgentRunner(
  options: AgentRunnerOptions
): Promise<AgentRunnerResult> {
  const {
    agentType, agentId, workspaceId, workspaceName,
    sessionId, userRef, userMessage,
  } = options

  const startTime = Date.now()
  const isMock    = process.env.MOCK_LLM === 'true'

  // ── 1. Contexte de session ──────────────────────────────────
  const sessionCtx = sessionId ? await getSessionContext(sessionId) : null

  // ── 2. Mémoire agent ────────────────────────────────────────
  const memory = userRef
    ? await getAgentMemory(workspaceId, agentId, userRef)
    : null

  // ── 3. RAG — vectorisation + recherche KB ──────────────────
  const chunks = isMock ? [] : await (async () => {
    const embedding = await embedText(userMessage)
    return matchKnowledge(embedding, workspaceId, agentId, 5, 0.5)
  })()

  // Log appel entrant
  await writeAgentLog(
    workspaceId, agentId, sessionId ?? null, 'message_in',
    {
      content_length:  userMessage.length,
      channel:         sessionCtx?.channel ?? 'unknown',
      kb_chunks_found: chunks.length,
      mock:            isMock,
    }
  )

  // ── 4. Prompt système ────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(agentType, {
    COMPANY_NAME:     workspaceName,
    WORKSPACE_ID:     workspaceId,
    CHANNEL:          sessionCtx?.channel,
    CURRENT_DATETIME: new Date().toISOString(),
    TICKET_STATUS:    sessionCtx?.sessionContext?.ticket_status as string | undefined,
    AGENT_MEMORY:     formatMemoryForPrompt(memory),
    KB_CHUNKS:        formatChunksForPrompt(chunks),
    ESCALATION_TEAM:  'notre équipe',
    HANDOFF_CONTEXT:  undefined,
    LEAD_MEMORY:      undefined,
    LEAD_SOURCE:      undefined,
    LEAD_STATUS:      undefined,
    LEAD_SCORE:       undefined,
  })

  // ── 5. Historique messages ───────────────────────────────────
  const history = sessionId ? await getSessionMessages(sessionId, 20) : []
  const llmMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...history
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: userMessage },
  ]

  // ── 6. Appel LLM ou Mock ─────────────────────────────────────
  let text: string
  let tokensUsed = 0
  let modelId    = 'mock'

  if (isMock) {
    console.log(`[runner] MOCK_LLM=true — réponse simulée (${agentType})`)
    text = getMockResponse(agentType, userMessage)
    await new Promise(r => setTimeout(r, 300))
  } else {
    const { model, modelId: mid } = getLLMModel()
    modelId = mid

    const result = await generateText({
      model,
      system:    systemPrompt,
      messages:  llmMessages,
      maxTokens: 1024,
    })
    text       = result.text
    tokensUsed = result.usage?.totalTokens ?? 0
  }

  const latencyMs = Date.now() - startTime

  // ── 7. Persistance messages ──────────────────────────────────
  if (sessionId) {
    await saveMessage(sessionId, 'user',      userMessage)
    await saveMessage(sessionId, 'assistant', text, tokensUsed, latencyMs)
  }

  // ── 8. Détection actions ─────────────────────────────────────
  let actionTriggered: AgentRunnerResult['actionTriggered'] = null

  if (agentType === 'support') {
    if (detectSalesHandoff(text)) {
      actionTriggered = 'HANDOFF_TO_SALES'
      triggerN8nWebhook('agent-handoff', {
        session_id: sessionId, workspace_id: workspaceId,
        target: 'sales',
        context: { summary: `Prospect depuis session support ${sessionId}`, user_ref: userRef },
      }).catch(err => console.warn('[n8n] Handoff failed:', err))
    } else if (detectEscalation(text)) {
      actionTriggered = 'ESCALATE_TO_HUMAN'
      triggerN8nWebhook('support-escalate', {
        session_id: sessionId, workspace_id: workspaceId, priority: 'high',
      }).catch(err => console.warn('[n8n] Escalate failed:', err))
    }
  }

  // ── 9. Log réponse ───────────────────────────────────────────
  await writeAgentLog(
    workspaceId, agentId, sessionId ?? null, 'message_out',
    { kb_chunks_used: chunks.length, action_triggered: actionTriggered, mock: isMock },
    { latencyMs, tokensUsed, modelUsed: modelId }
  )

  return { text, tokensUsed, latencyMs, actionTriggered }
}