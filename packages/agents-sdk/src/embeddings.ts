/**
 * embedText
 * Génère un vecteur d'embedding pour un texte donné.
 *
 * Provider configuré via EMBEDDING_PROVIDER :
 *   - 'openai'  → text-embedding-3-small (1536 dims) — défaut
 *   - 'voyage'  → voyage-3-lite          (1024 dims) — plus économique
 *   - 'none'    → désactivé (retourne tableau vide, pas de RAG)
 *
 * IMPORTANT : si tu changes de provider, une migration SQL est nécessaire
 * pour modifier vector(1536) dans knowledge_chunks.embedding
 */

const PROVIDER = (process.env.EMBEDDING_PROVIDER ?? 'none') as
  | 'openai'
  | 'voyage'
  | 'none'

// ─────────────────────────────────────────────────────────────
// OpenAI
// ─────────────────────────────────────────────────────────────

async function embedWithOpenAI(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY manquant')

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8191),
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI embedding error ${res.status}: ${err}`)
  }

  const data = await res.json() as { data: Array<{ embedding: number[] }> }
  const embedding = data.data[0]?.embedding
  if (!embedding) throw new Error('OpenAI: réponse embedding vide')
  return embedding
}

// ─────────────────────────────────────────────────────────────
// Voyage AI
// ─────────────────────────────────────────────────────────────

async function embedWithVoyage(text: string): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY
  if (!apiKey) throw new Error('VOYAGE_API_KEY manquant')

  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model: 'voyage-3-lite',
      input: [text],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Voyage embedding error ${res.status}: ${err}`)
  }

  const data = await res.json() as { data: Array<{ embedding: number[] }> }
  const embedding = data.data[0]?.embedding
  if (!embedding) throw new Error('Voyage: réponse embedding vide')
  return embedding
}

// ─────────────────────────────────────────────────────────────
// Export principal
// ─────────────────────────────────────────────────────────────

/**
 * Génère un embedding pour un texte.
 * Si EMBEDDING_PROVIDER=none ou non configuré, retourne [] (RAG désactivé).
 */
export async function embedText(text: string): Promise<number[]> {
  const cleaned = text.trim().replace(/\s+/g, ' ')
  if (!cleaned) return []

  switch (PROVIDER) {
    case 'openai':
      return embedWithOpenAI(cleaned)
    case 'voyage':
      return embedWithVoyage(cleaned)
    case 'none':
    default:
      console.warn(`[embeddings] Provider '${PROVIDER}' — embeddings désactivés, RAG ignoré`)
      return []
  }
}
