/**
 * matchKnowledge
 * Recherche les chunks pertinents dans la KB via RPC Supabase pgvector.
 *
 * Appelle la fonction SQL match_knowledge_chunks définie dans 001_initial_schema.sql.
 * Filtre par workspace_id + agent_id (chunks propres à l'agent + chunks partagés).
 */

import { createClient } from '@supabase/supabase-js'

export type KnowledgeChunk = {
  id:         string
  content:    string
  source:     'manual' | 'url' | 'file'
  source_ref: string | null
  metadata:   Record<string, unknown>
  similarity: number
}

/**
 * Recherche les chunks les plus proches de l'embedding fourni.
 *
 * @param embedding    - Vecteur de la requête utilisateur (produit par embedText)
 * @param workspaceId  - Tenant courant
 * @param agentId      - Agent courant (inclut aussi les chunks partagés agent_id = null)
 * @param limit        - Nombre max de chunks retournés (défaut : 5)
 * @param minSimilarity - Seuil de similarité minimale 0-1 (défaut : 0.5)
 * @returns Chunks triés par similarité décroissante
 */
export async function matchKnowledge(
  embedding:     number[],
  workspaceId:   string,
  agentId?:      string,
  limit          = 5,
  minSimilarity  = 0.5
): Promise<KnowledgeChunk[]> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data, error } = await supabase.rpc('match_knowledge_chunks', {
    query_embedding:  embedding,
    p_workspace_id:   workspaceId,
    p_agent_id:       agentId ?? null,
    match_count:      limit,
    min_similarity:   minSimilarity,
  })

  if (error) {
    throw new Error(`matchKnowledge RPC error: ${error.message}`)
  }

  return (data ?? []) as KnowledgeChunk[]
}

/**
 * Formate les chunks en blocs de texte injectables dans un prompt.
 * Chaque chunk est séparé par un délimiteur clair pour le LLM.
 *
 * @param chunks - Résultats de matchKnowledge
 * @returns Chaîne prête à injecter dans {{KB_CHUNKS}}
 */
export function formatChunksForPrompt(chunks: KnowledgeChunk[]): string {
  if (chunks.length === 0) return ''

  return chunks
    .map((chunk, i) => `[Source ${i + 1}${chunk.source_ref ? ` — ${chunk.source_ref}` : ''}]\n${chunk.content}`)
    .join('\n\n---\n\n')
}
