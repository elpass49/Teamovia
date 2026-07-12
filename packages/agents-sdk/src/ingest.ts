import { createClient } from '@supabase/supabase-js'
import { embedText } from './embeddings'

export type IngestResult = {
  id:         string
  content:    string
  source:     string
  source_ref: string | null
}

export async function ingestText(
  text:        string,
  workspaceId: string,
  agentId?:    string,
  source:      'manual' | 'url' | 'file' = 'manual',
  sourceRef?:  string
): Promise<IngestResult> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const embedding = await embedText(text)

  const { data, error } = await supabase
    .from('knowledge_chunks')
    .insert({
      workspace_id: workspaceId,
      agent_id:     agentId ?? null,
      content:      text,
      embedding,
      source,
      source_ref:   sourceRef ?? null,
    })
    .select('id, content, source, source_ref')
    .single()

  if (error || !data) {
    throw new Error(`ingestText error: ${error?.message}`)
  }

  return data as IngestResult
}
