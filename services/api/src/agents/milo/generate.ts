/**
 * Routes : Agent Contenu Milo
 *
 * POST /agents/milo/generate  → génère du contenu à la demande
 * GET  /agents/milo/history   → historique des contenus générés
 */

import { Hono }         from 'hono'
import { zValidator }   from '@hono/zod-validator'
import { z }            from 'zod'
import { createClient } from '@supabase/supabase-js'
import { readFileSync }  from 'node:fs'
import { join }          from 'node:path'
import {
  workspaceMiddleware,
  type WorkspaceContext,
} from '../../middleware/validate-workspace.js'

// ─────────────────────────────────────────────────────────────
// Schémas
// ─────────────────────────────────────────────────────────────

const ContentFormat = z.enum([
  'post_linkedin',
  'post_instagram',
  'post_facebook',
  'email_client',
  'article_blog',
  'description_produit',
  'script_video',
  'sms',
])

const ContentTone = z.enum([
  'professionnel',
  'chaleureux',
  'expert',
  'decontracte',
  'persuasif',
])

const GenerateSchema = z.object({
  prompt:    z.string().min(5, 'Décrivez le contenu à générer').max(2000),
  format:    ContentFormat,
  tone:      ContentTone.default('professionnel'),
  variants:  z.number().int().min(1).max(3).default(1),
  context:   z.string().optional(), // infos supplémentaires
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

const FORMAT_LABEL: Record<z.infer<typeof ContentFormat>, string> = {
  post_linkedin:       'Post LinkedIn',
  post_instagram:      'Post Instagram',
  post_facebook:       'Post Facebook',
  email_client:        'Email client',
  article_blog:        'Article de blog',
  description_produit: 'Description produit',
  script_video:        'Script vidéo',
  sms:                 'SMS',
}

const TONE_LABEL: Record<z.infer<typeof ContentTone>, string> = {
  professionnel: 'Professionnel',
  chaleureux:    'Chaleureux',
  expert:        'Expert',
  decontracte:   'Décontracté',
  persuasif:     'Persuasif',
}

function buildMiloPrompt(
  workspaceName: string,
  format: string,
  tone: string,
  kbChunks: string
): string {
  try {
    const filePath = join(process.cwd(), '..', '..', 'packages', 'prompts', 'agent-milo.system.md')
    const raw = readFileSync(filePath, 'utf-8')
    return raw
      .replace(/\{\{COMPANY_NAME\}\}/g,     workspaceName)
      .replace(/\{\{CURRENT_DATETIME\}\}/g, new Date().toISOString())
      .replace(/\{\{CONTENT_FORMAT\}\}/g,   FORMAT_LABEL[format as z.infer<typeof ContentFormat>] ?? format)
      .replace(/\{\{CONTENT_TONE\}\}/g,     TONE_LABEL[tone as z.infer<typeof ContentTone>] ?? tone)
      .replace(/\{\{#if KB_CHUNKS\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g,
        (_, ifBlock, elseBlock) => kbChunks
          ? ifBlock.replace('{{KB_CHUNKS}}', kbChunks)
          : elseBlock
      )
      .replace(/\{\{[\w_]+\}\}/g, '')
  } catch {
    return `Tu es Milo, l'agent contenu de ${workspaceName}.
Produis du contenu professionnel en français pour le format : ${FORMAT_LABEL[format as z.infer<typeof ContentFormat>] ?? format}.
Ton : ${tone}. Contenu immédiatement utilisable, sans placeholders.`
  }
}

async function getKBChunks(workspaceId: string): Promise<string> {
  try {
    const supabase = serverClient()
    const { data } = await supabase
      .from('knowledge_chunks')
      .select('content')
      .eq('workspace_id', workspaceId)
      .limit(5)

    if (!data || data.length === 0) return ''
    return data.map((c: any, i: number) => `[${i + 1}] ${c.content}`).join('\n\n')
  } catch {
    return ''
  }
}

async function callDeepSeek(
  systemPrompt: string,
  userPrompt:   string,
  maxTokens:    number = 1500
): Promise<{ text: string; tokensUsed: number }> {
  const res = await fetch(
    `${process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1'}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model:      process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
        messages:   [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.8, // plus créatif que les agents support/sales
      }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`DeepSeek error ${res.status}: ${err}`)
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>
    usage?:  { total_tokens?: number }
  }

  return {
    text:       data.choices[0]?.message?.content ?? '',
    tokensUsed: data.usage?.total_tokens ?? 0,
  }
}

// ─────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────

export const miloRoute = new Hono()

// ── POST /generate ───────────────────────────────────────────

miloRoute.post(
  '/generate',
  workspaceMiddleware({ quota: 'messages' }),
  zValidator('json', GenerateSchema),
  async (c) => {
    const ctx  = c.get('workspace') as WorkspaceContext
    const body = c.req.valid('json')
    const startTime = Date.now()

    // Récupérer KB pour contextualiser
    const kbChunks = await getKBChunks(ctx.workspaceId)

    // Construire le prompt système
    const systemPrompt = buildMiloPrompt(
      ctx.workspaceName,
      body.format,
      body.tone,
      kbChunks
    )

    // Construire le prompt utilisateur
    const variantsText = body.variants > 1
      ? `\n\nGénère ${body.variants} variantes distinctes, séparées par "---".`
      : ''

    const contextText = body.context
      ? `\n\nContexte supplémentaire : ${body.context}`
      : ''

    const userPrompt = `Format : ${FORMAT_LABEL[body.format]}
Ton : ${TONE_LABEL[body.tone]}
Demande : ${body.prompt}${contextText}${variantsText}

Produis le contenu directement, sans introduction ni explication.`

    // Appel LLM
    let text = ''
    let tokensUsed = 0

    try {
      const result = await callDeepSeek(systemPrompt, userPrompt, 2000)
      text       = result.text
      tokensUsed = result.tokensUsed
      console.log(`[milo] generated ${text.length} chars, ${tokensUsed} tokens`)
    } catch (err) {
      console.error('[milo] LLM error:', err)
      return c.json({ error: 'Erreur lors de la génération', code: 'LLM_ERROR' }, 500)
    }

    const latencyMs = Date.now() - startTime

    // Sauvegarder dans agent_logs
    const supabase = serverClient()
    await supabase.from('agent_logs').insert({
      workspace_id: ctx.workspaceId,
      event_type:   'message_out',
      payload: {
        agent:      'milo',
        format:     body.format,
        tone:       body.tone,
        prompt:     body.prompt.slice(0, 200),
        variants:   body.variants,
      },
      latency_ms:  latencyMs,
      tokens_used: tokensUsed,
      model_used:  `deepseek/${process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'}`,
    })

    // Parser les variantes si plusieurs
    const variants = body.variants > 1
      ? text.split(/^---+$/m).map((v: string) => v.trim()).filter((v: string) => v.length > 0)
      : [text.trim()]

    return c.json({
      format:      body.format,
      format_label: FORMAT_LABEL[body.format],
      tone:        body.tone,
      prompt:      body.prompt,
      variants,
      tokens_used: tokensUsed,
      latency_ms:  latencyMs,
    })
  }
)

// ── GET /history ─────────────────────────────────────────────

miloRoute.get(
  '/history',
  workspaceMiddleware(),
  async (c) => {
    const ctx     = c.get('workspace') as WorkspaceContext
    const page    = Number(c.req.query('page') ?? 1)
    const perPage = Math.min(Number(c.req.query('per_page') ?? 20), 50)
    const supabase = serverClient()

    const { data, count } = await supabase
      .from('agent_logs')
      .select('*', { count: 'exact' })
      .eq('workspace_id', ctx.workspaceId)
      .eq('event_type', 'message_out')
      .contains('payload', { agent: 'milo' })
      .order('created_at', { ascending: false })
      .range((page - 1) * perPage, page * perPage - 1)

    return c.json({
      history: data ?? [],
      pagination: {
        total:    count ?? 0,
        page,
        per_page: perPage,
        has_more: (count ?? 0) > page * perPage,
      },
    })
  }
)
