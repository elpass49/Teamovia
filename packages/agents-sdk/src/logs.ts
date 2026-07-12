/**
 * writeAgentLog
 * Écrit un événement dans la table agent_logs.
 *
 * Règle : ne jamais lever d'exception si le log échoue.
 * Un échec de logging ne doit pas faire échouer la requête utilisateur.
 * Les erreurs de log sont silencieuses en prod, affichées en dev.
 */

import { createClient } from '@supabase/supabase-js'

export type LogEvent =
  | 'message_in'
  | 'message_out'
  | 'tool_call'
  | 'handoff'
  | 'escalation'
  | 'crm_sync'
  | 'error'

export type LogMeta = {
  latencyMs?:  number
  tokensUsed?: number
  modelUsed?:  string
}

/**
 * Écrit un log d'activité agent.
 * Fire-and-forget — n'attend pas la confirmation Supabase en prod.
 */
export async function writeAgentLog(
  workspaceId: string,
  agentId:     string | null,
  sessionId:   string | null,
  eventType:   LogEvent,
  payload:     Record<string, unknown>,
  meta:        LogMeta = {}
): Promise<void> {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const { error } = await supabase.from('agent_logs').insert({
      workspace_id: workspaceId,
      agent_id:     agentId,
      session_id:   sessionId,
      event_type:   eventType,
      payload,
      latency_ms:   meta.latencyMs   ?? null,
      tokens_used:  meta.tokensUsed  ?? null,
      model_used:   meta.modelUsed   ?? null,
    })

    if (error && process.env.NODE_ENV !== 'production') {
      console.warn('[agent_logs] Erreur de logging :', error.message)
    }
  } catch (err) {
    // Silencieux en prod — un log qui plante ne doit pas impacter l'utilisateur
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[agent_logs] Exception :', err)
    }
  }
}
