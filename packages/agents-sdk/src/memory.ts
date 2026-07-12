/**
 * Agent Memory
 * Lecture et mise à jour de la mémoire persistante par (agent, user_ref).
 *
 * Niveau 2 de mémoire (sur 4) :
 *   - Niveau 1 : session_context    (court terme, durée d'une session)
 *   - Niveau 2 : agent_memory       ← ce fichier
 *   - Niveau 3 : workspace_context  (partagé entre agents)
 *   - Niveau 4 : knowledge_chunks   (KB vectorisée)
 */

import { createClient } from '@supabase/supabase-js'

export type AgentMemory = {
  facts:       Record<string, unknown>
  preferences: Record<string, unknown>
}

/**
 * Récupère la mémoire d'un utilisateur pour un agent donné.
 * Retourne null si aucune mémoire n'existe encore (première interaction).
 */
export async function getAgentMemory(
  workspaceId: string,
  agentId:     string,
  userRef:     string
): Promise<AgentMemory | null> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data, error } = await supabase
    .from('agent_memory')
    .select('facts, preferences')
    .eq('workspace_id', workspaceId)
    .eq('agent_id', agentId)
    .eq('user_ref', userRef)
    .single()

  if (error || !data) return null

  return {
    facts:       (data.facts       as Record<string, unknown>) ?? {},
    preferences: (data.preferences as Record<string, unknown>) ?? {},
  }
}

/**
 * Met à jour (ou crée) la mémoire d'un utilisateur.
 * Utilise un upsert — merge avec les données existantes.
 *
 * @param patch - Données partielles à fusionner avec la mémoire existante
 */
export async function updateAgentMemory(
  workspaceId: string,
  agentId:     string,
  userRef:     string,
  patch:       Partial<AgentMemory>
): Promise<void> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  // Récupérer la mémoire existante pour merger
  const existing = await getAgentMemory(workspaceId, agentId, userRef)

  const merged: AgentMemory = {
    facts:       { ...(existing?.facts ?? {}),       ...(patch.facts ?? {}) },
    preferences: { ...(existing?.preferences ?? {}), ...(patch.preferences ?? {}) },
  }

  const { error } = await supabase
    .from('agent_memory')
    .upsert({
      workspace_id: workspaceId,
      agent_id:     agentId,
      user_ref:     userRef,
      facts:        merged.facts,
      preferences:  merged.preferences,
      last_seen:    new Date().toISOString(),
    }, {
      onConflict: 'workspace_id,agent_id,user_ref',
    })

  if (error) {
    throw new Error(`updateAgentMemory error: ${error.message}`)
  }
}

/**
 * Formate la mémoire en texte injectable dans {{AGENT_MEMORY}} du prompt.
 * Retourne une chaîne vide si la mémoire est vide.
 */
export function formatMemoryForPrompt(memory: AgentMemory | null): string {
  if (!memory) return ''

  const parts: string[] = []

  const facts = Object.entries(memory.facts)
  if (facts.length > 0) {
    parts.push('Faits connus sur ce client :')
    facts.forEach(([k, v]) => parts.push(`- ${k} : ${String(v)}`))
  }

  const prefs = Object.entries(memory.preferences)
  if (prefs.length > 0) {
    parts.push('Préférences détectées :')
    prefs.forEach(([k, v]) => parts.push(`- ${k} : ${String(v)}`))
  }

  return parts.join('\n')
}
