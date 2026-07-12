/**
 * embedText
 * Génère un vecteur d'embedding pour un texte donné.
 *
 * Provider configuré via EMBEDDING_PROVIDER :
 *   - 'openai'   → text-embedding-3-small (1536 dims) — défaut
 *   - 'voyage'   → voyage-3-lite          (1024 dims) — plus économique
 *   - 'deepseek' → deepseek-embedding     (1024 dims) — économique + local
 *
 * IMPORTANT : si tu changes de provider, une migration SQL est nécessaire
 * pour modifier vector(1536) → vector(1024) dans knowledge_chunks.embedding
 */

const PROVIDER = (process.env.EMBEDDING_PROVIDER ?? 'openai') as 'openai' | 'voyage' | 'deepseek'

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
      input: text.slice(0, 8191), // limite de tokens du modèle
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI embedding error ${res.status}: ${err}`)
  }

  const data = await res.json() as {
    data: Array<{ embedding: number[] }>
  }

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

  const data = await res.json() as {
    data: Array<{ embedding: number[] }>
  }

  const embedding = data.data[0]?.embedding
  if (!embedding) throw new Error('Voyage: réponse embedding vide')

  return embedding
}

// ─────────────────────────────────────────────────────────────
// Deepseek
// ─────────────────────────────────────────────────────────────

async function embedWithDeepseek(text: string): Promise<number[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY manquant')

  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1'

  const res = await fetch(`${baseUrl}/embeddings`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-embedding',
      input: text.slice(0, 8191), // limite de tokens
      encoding_format: 'float',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Deepseek embedding error ${res.status}: ${err}`)
  }

  const data = await res.json() as {
    data: Array<{ embedding: number[] }>
  }

  const embedding = data.data[0]?.embedding
  if (!embedding) throw new Error('Deepseek: réponse embedding vide')

  return embedding
}

// ─────────────────────────────────────────────────────────────
// Export principal
// ─────────────────────────────────────────────────────────────

/**
 * Génère un embedding pour un texte.
 * Utilise le provider configuré dans EMBEDDING_PROVIDER.
 *
 * @param text - Texte à vectoriser (nettoyé automatiquement)
 * @returns Vecteur de nombres flottants
 */
export async function embedText(text: string): Promise<number[]> {
  // Nettoyage basique : supprime les espaces excessifs et les sauts de ligne multiples
  const cleaned = text.trim().replace(/\s+/g, ' ')
  if (!cleaned) throw new Error('embedText: texte vide')

  switch (PROVIDER) {
    case 'openai':  return embedWithOpenAI(cleaned)
    case 'voyage':  return embedWithVoyage(cleaned)
    case 'deepseek': return embedWithDeepseek(cleaned)
    default:        throw new Error(`Provider d'embedding inconnu : ${PROVIDER}`)
  }
}
