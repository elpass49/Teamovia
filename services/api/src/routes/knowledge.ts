/**
 * Routes : Base de connaissances
 *
 * GET    /v1/knowledge        → liste les chunks du workspace
 * POST   /v1/knowledge        → ajoute un chunk + génère l'embedding
 * DELETE /v1/knowledge/:id    → supprime un chunk
 * POST   /v1/knowledge/search → recherche sémantique (debug)
 */

import { Hono }              from 'hono'
import { zValidator }        from '@hono/zod-validator'
import { z }                 from 'zod'
import { createClient }      from '@supabase/supabase-js'
import { embedText }         from '@teamovia/agents-sdk'
import {
  workspaceMiddleware,
  type WorkspaceContext,
} from '../middleware/validate-workspace.js'

// ─────────────────────────────────────────────────────────────
// Schémas
// ─────────────────────────────────────────────────────────────

const CreateChunkSchema = z.object({
  content:    z.string().min(10, 'Contenu trop court (min 10 caractères)').max(8000),
  agent_id:   z.string().uuid().nullable().optional(), // null = partagé
  source:     z.enum(['manual', 'url', 'file']).default('manual'),
  source_ref: z.string().optional(),
  metadata:   z.record(z.unknown()).optional().default({}),
})

const SearchSchema = z.object({
  query:    z.string().min(1),
  agent_id: z.string().uuid().nullable().optional(),
  limit:    z.number().int().min(1).max(20).default(5),
})

// ─────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────

function serverClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// ─────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────

export const knowledgeRoute = new Hono()

// ── GET /knowledge ───────────────────────────────────────────

knowledgeRoute.get(
  '/',
  workspaceMiddleware({ allowWidget: true }),
  async (c) => {
    const ctx      = c.get('workspace') as WorkspaceContext
    const agentId  = c.req.query('agent_id') ?? null
    const source   = c.req.query('source')
    const page     = Number(c.req.query('page') ?? 1)
    const perPage  = Math.min(Number(c.req.query('per_page') ?? 20), 100)

    const supabase = serverClient()

    let query = supabase
      .from('knowledge_chunks')
      .select('id, content, agent_id, source, source_ref, metadata, created_at', { count: 'exact' })
      .eq('workspace_id', ctx.workspaceId)
      .order('created_at', { ascending: false })
      .range((page - 1) * perPage, page * perPage - 1)

    if (agentId !== null && agentId !== undefined) {
      query = query.eq('agent_id', agentId)
    }
    if (source) query = query.eq('source', source)

    const { data, error, count } = await query

    if (error) {
      return c.json({ error: error.message, code: 'DB_ERROR' }, 500)
    }

    return c.json({
      chunks: data ?? [],
      pagination: {
        total:    count ?? 0,
        page,
        per_page: perPage,
        has_more: (count ?? 0) > page * perPage,
      },
    })
  }
)

// ── POST /knowledge ──────────────────────────────────────────

knowledgeRoute.post(
  '/',
  workspaceMiddleware({ allowWidget: true }),
  zValidator('json', CreateChunkSchema),
  async (c) => {
    const ctx  = c.get('workspace') as WorkspaceContext
    const body = c.req.valid('json')

    // Générer l'embedding
    let embedding: number[] = []
    try {
      embedding = await embedText(body.content)
    } catch (err) {
      console.warn('[knowledge] Embedding failed:', err)
      // On insère quand même sans embedding — chunk non searchable par RAG
    }

    const supabase = serverClient()

    const { data: chunk, error } = await supabase
      .from('knowledge_chunks')
      .insert({
        workspace_id: ctx.workspaceId,
        agent_id:     body.agent_id ?? null,
        content:      body.content,
        embedding:    embedding.length > 0 ? embedding : null,
        source:       body.source,
        source_ref:   body.source_ref ?? null,
        metadata:     body.metadata,
      })
      .select('id, content, agent_id, source, source_ref, metadata, created_at')
      .single()

    if (error || !chunk) {
      console.error('[knowledge] Insert error:', error)
      return c.json({ error: 'Erreur création chunk', code: 'INSERT_ERROR' }, 500)
    }

    return c.json({
      ...chunk,
      embedding_generated: embedding.length > 0,
    }, 201)
  }
)

// ── DELETE /knowledge/:id ────────────────────────────────────

knowledgeRoute.delete(
  '/:id',
  workspaceMiddleware({ allowWidget: true }),
  async (c) => {
    const ctx = c.get('workspace') as WorkspaceContext
    const id  = c.req.param('id')

    const supabase = serverClient()

    const { error } = await supabase
      .from('knowledge_chunks')
      .delete()
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)

    if (error) {
      return c.json({ error: 'Chunk introuvable', code: 'NOT_FOUND' }, 404)
    }

    return c.body(null, 204)
  }
)

// ── POST /knowledge/search ───────────────────────────────────

knowledgeRoute.post(
  '/search',
  workspaceMiddleware({ allowWidget: true }),
  zValidator('json', SearchSchema),
  async (c) => {
    const ctx  = c.get('workspace') as WorkspaceContext
    const body = c.req.valid('json')

    let embedding: number[] = []
    try {
      embedding = await embedText(body.query)
    } catch (err) {
      return c.json({ error: 'Impossible de vectoriser la requête', code: 'EMBED_ERROR' }, 500)
    }

    if (embedding.length === 0) {
      return c.json({ error: 'Embeddings non configurés', code: 'NO_EMBEDDINGS' }, 400)
    }

    const supabase = serverClient()

    const { data, error } = await supabase.rpc('match_knowledge_chunks', {
      query_embedding: embedding,
      p_workspace_id:  ctx.workspaceId,
      p_agent_id:      body.agent_id ?? null,
      match_count:     body.limit,
      min_similarity:  0.3,
    })

    if (error) {
      return c.json({ error: error.message, code: 'SEARCH_ERROR' }, 500)
    }

    return c.json({ results: data ?? [] })
  }
)
