/**
 * /kb — Interface de gestion de la Base de Connaissances
 */

'use client'

import { useEffect, useState, useCallback } from 'react'

type AgentType = 'support' | 'sales' | 'shared'

type Chunk = {
  id:         string
  content:    string
  agent_id:   string | null
  source:     string
  source_ref: string | null
  metadata:   Record<string, unknown>
  created_at: string
  embedding_generated?: boolean
}

const API_URL         = 'http://127.0.0.1:8000/v1'
const WORKSPACE_TOKEN = 'b5299bf5-ad3a-4072-966e-8d4f4e94396e'

const AGENT_ID = {
  support: '00000000-0000-0000-0000-000000000020',
  sales:   '00000000-0000-0000-0000-000000000021',
  shared:  null,
}

const AGENT_LABEL: Record<AgentType, string> = {
  support: 'Support client',
  sales:   'Agent ventes',
  shared:  'Partagé (tous les agents)',
}

const AGENT_COLOR: Record<AgentType, string> = {
  support: '#4F6EF7',
  sales:   '#F39C12',
  shared:  '#2ECC71',
}

function agentTypeFromId(id: string | null): AgentType {
  if (!id) return 'shared'
  if (id === AGENT_ID.support) return 'support'
  if (id === AGENT_ID.sales)   return 'sales'
  return 'shared'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function KBPage() {
  const [chunks,      setChunks]      = useState<Chunk[]>([])
  const [loading,     setLoading]     = useState(true)
  const [filter,      setFilter]      = useState<AgentType | 'all'>('all')
  const [adding,      setAdding]      = useState(false)
  const [deleting,    setDeleting]    = useState<string | null>(null)
  const [showForm,    setShowForm]    = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Chunk[] | null>(null)
  const [searching,   setSearching]   = useState(false)
  const [error,       setError]       = useState('')

  // Form state
  const [formContent,  setFormContent]  = useState('')
  const [formAgent,    setFormAgent]    = useState<AgentType>('support')
  const [formSourceRef, setFormSourceRef] = useState('')

  const headers = {
    'Content-Type':      'application/json',
    'x-workspace-token': WORKSPACE_TOKEN,
  }

  // ── Charger les chunks ──────────────────────────────────────
  const loadChunks = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res  = await fetch(`${API_URL}/knowledge?per_page=50`, { headers })
      const data = await res.json()
      setChunks(data.chunks ?? [])
    } catch (err) {
      setError('Impossible de charger la KB — API hors ligne ?')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadChunks() }, [loadChunks])

  // ── Ajouter un chunk ─────────────────────────────────────────
  async function addChunk() {
    if (!formContent.trim()) return
    setAdding(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/knowledge`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content:    formContent.trim(),
          agent_id:   AGENT_ID[formAgent],
          source:     'manual',
          source_ref: formSourceRef.trim() || undefined,
        }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const chunk = await res.json()
      setChunks(prev => [chunk, ...prev])
      setFormContent('')
      setFormSourceRef('')
      setShowForm(false)
    } catch (err) {
      setError("Erreur lors de l'ajout du chunk.")
    } finally {
      setAdding(false)
    }
  }

  // ── Supprimer un chunk ──────────────────────────────────────
  async function deleteChunk(id: string) {
    setDeleting(id)
    try {
      await fetch(`${API_URL}/knowledge/${id}`, { method: 'DELETE', headers })
      setChunks(prev => prev.filter(c => c.id !== id))
    } catch (err) {
      setError('Erreur lors de la suppression.')
    } finally {
      setDeleting(null)
    }
  }

  // ── Recherche sémantique ────────────────────────────────────
  async function search() {
    if (!searchQuery.trim()) return
    setSearching(true)
    setSearchResults(null)
    try {
      const res = await fetch(`${API_URL}/knowledge/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: searchQuery, limit: 5 }),
      })
      const data = await res.json()
      setSearchResults(data.results ?? [])
    } catch (err) {
      setError('Erreur recherche.')
    } finally {
      setSearching(false)
    }
  }

  // ── Filtrage ────────────────────────────────────────────────
  const filteredChunks = chunks.filter(c => {
    if (filter === 'all') return true
    return agentTypeFromId(c.agent_id) === filter
  })

  const displayChunks = searchResults ?? filteredChunks

  // ─────────────────────────────────────────────────────────────
  // Rendu
  // ─────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: '100vh', background: '#0F1117',
      color: '#E8EAEE', fontFamily: "'Inter', system-ui, sans-serif",
      padding: '32px',
    }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#E8EAEE' }}>
              Base de connaissances
            </h1>
            <p style={{ fontSize: '13px', color: '#7A839A', marginTop: '4px' }}>
              {chunks.length} chunk{chunks.length > 1 ? 's' : ''} — utilisés par le RAG pour répondre aux clients
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              padding: '9px 18px', borderRadius: '8px', border: 'none',
              cursor: 'pointer', fontSize: '13px', fontWeight: 600,
              background: '#4F6EF7', color: '#fff',
              transition: 'background 150ms',
            }}
          >
            + Ajouter un chunk
          </button>
        </div>

        {/* Erreur */}
        {error && (
          <div style={{
            padding: '10px 14px', background: 'rgba(231,76,60,.1)',
            border: '1px solid rgba(231,76,60,.3)', borderRadius: '8px',
            fontSize: '13px', color: '#E74C3C', marginBottom: '16px',
          }}>
            {error}
          </div>
        )}

        {/* Formulaire d'ajout */}
        {showForm && (
          <div style={{
            background: '#181C27', border: '1px solid #2A3048',
            borderRadius: '12px', padding: '20px', marginBottom: '24px',
          }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', color: '#E8EAEE' }}>
              Nouveau chunk
            </h3>

            {/* Sélecteur agent */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              {(['support', 'sales', 'shared'] as AgentType[]).map(a => (
                <button
                  key={a}
                  onClick={() => setFormAgent(a)}
                  style={{
                    padding: '6px 14px', borderRadius: '20px', border: 'none',
                    cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                    background: formAgent === a ? AGENT_COLOR[a] : '#1E2336',
                    color: formAgent === a ? '#fff' : '#7A839A',
                    transition: 'all 150ms',
                  }}
                >
                  {AGENT_LABEL[a]}
                </button>
              ))}
            </div>

            {/* Contenu */}
            <textarea
              value={formContent}
              onChange={e => setFormContent(e.target.value)}
              placeholder="Contenu du chunk — ce texte sera vectorisé et utilisé par le RAG pour répondre aux questions..."
              rows={5}
              style={{
                width: '100%', background: '#1E2336',
                border: '1px solid #2A3048', borderRadius: '8px',
                padding: '10px 14px', color: '#E8EAEE',
                fontSize: '13px', lineHeight: '1.5',
                fontFamily: 'inherit', resize: 'vertical', outline: 'none',
                boxSizing: 'border-box',
              }}
            />

            {/* Source ref */}
            <input
              type="text"
              value={formSourceRef}
              onChange={e => setFormSourceRef(e.target.value)}
              placeholder="Référence source (optionnel) — ex: faq-delais, page-tarifs"
              style={{
                width: '100%', background: '#1E2336',
                border: '1px solid #2A3048', borderRadius: '8px',
                padding: '8px 14px', color: '#E8EAEE',
                fontSize: '12px', fontFamily: 'inherit', outline: 'none',
                marginTop: '8px', boxSizing: 'border-box',
              }}
            />

            {/* Compteur */}
            <div style={{ fontSize: '11px', color: '#454D66', marginTop: '6px', textAlign: 'right' }}>
              {formContent.length} / 8000 caractères
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '14px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowForm(false); setFormContent(''); setFormSourceRef('') }}
                style={{
                  padding: '8px 16px', borderRadius: '8px',
                  border: '1px solid #2A3048', cursor: 'pointer',
                  fontSize: '13px', background: 'transparent', color: '#7A839A',
                }}
              >
                Annuler
              </button>
              <button
                onClick={addChunk}
                disabled={adding || formContent.trim().length < 10}
                style={{
                  padding: '8px 16px', borderRadius: '8px', border: 'none',
                  cursor: adding ? 'not-allowed' : 'pointer',
                  fontSize: '13px', fontWeight: 600,
                  background: '#4F6EF7', color: '#fff',
                  opacity: adding || formContent.trim().length < 10 ? .5 : 1,
                }}
              >
                {adding ? 'Génération embedding...' : 'Ajouter'}
              </button>
            </div>
          </div>
        )}

        {/* Recherche sémantique */}
        <div style={{
          display: 'flex', gap: '8px', marginBottom: '20px',
        }}>
          <input
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); if (!e.target.value) setSearchResults(null) }}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="Recherche sémantique dans la KB..."
            style={{
              flex: 1, background: '#181C27', border: '1px solid #2A3048',
              borderRadius: '8px', padding: '9px 14px', color: '#E8EAEE',
              fontSize: '13px', outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button
            onClick={search}
            disabled={searching || !searchQuery.trim()}
            style={{
              padding: '9px 16px', borderRadius: '8px', border: 'none',
              cursor: 'pointer', fontSize: '13px', fontWeight: 600,
              background: '#1E2336', color: '#7A839A',
              border: '1px solid #2A3048',
              opacity: searching || !searchQuery.trim() ? .5 : 1,
            }}
          >
            {searching ? '...' : 'Rechercher'}
          </button>
          {searchResults && (
            <button
              onClick={() => { setSearchResults(null); setSearchQuery('') }}
              style={{
                padding: '9px 14px', borderRadius: '8px',
                border: '1px solid #2A3048', cursor: 'pointer',
                fontSize: '12px', background: 'transparent', color: '#7A839A',
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Filtres */}
        {!searchResults && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
            {(['all', 'support', 'sales', 'shared'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '4px 12px', borderRadius: '20px', border: 'none',
                  cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                  background: filter === f ? (f === 'all' ? '#4F6EF7' : AGENT_COLOR[f as AgentType]) : '#181C27',
                  color: filter === f ? '#fff' : '#7A839A',
                  transition: 'all 150ms',
                }}
              >
                {f === 'all' ? `Tous (${chunks.length})` : AGENT_LABEL[f as AgentType]}
              </button>
            ))}
          </div>
        )}

        {/* Résultats recherche label */}
        {searchResults && (
          <div style={{ fontSize: '12px', color: '#7A839A', marginBottom: '12px' }}>
            {searchResults.length} résultat{searchResults.length > 1 ? 's' : ''} pour "{searchQuery}"
          </div>
        )}

        {/* Liste des chunks */}
        {loading ? (
          <div style={{ textAlign: 'center', color: '#454D66', padding: '40px' }}>Chargement...</div>
        ) : displayChunks.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#454D66', padding: '40px', fontSize: '14px' }}>
            {searchResults ? 'Aucun résultat' : 'Aucun chunk — ajoutez du contenu à la KB'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {displayChunks.map((chunk) => {
              const agentType = agentTypeFromId(chunk.agent_id)
              const similarity = (chunk as any).similarity

              return (
                <div
                  key={chunk.id}
                  style={{
                    background: '#181C27',
                    border: '1px solid #2A3048',
                    borderLeft: `3px solid ${AGENT_COLOR[agentType]}`,
                    borderRadius: '10px',
                    padding: '16px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: '10px', fontWeight: 600,
                        color: AGENT_COLOR[agentType],
                        background: `${AGENT_COLOR[agentType]}1A`,
                        padding: '2px 8px', borderRadius: '20px',
                        textTransform: 'uppercase',
                      }}>
                        {AGENT_LABEL[agentType]}
                      </span>
                      {chunk.source_ref && (
                        <span style={{
                          fontSize: '10px', color: '#454D66',
                          background: '#1E2336', padding: '2px 8px',
                          borderRadius: '20px', fontFamily: 'monospace',
                        }}>
                          {chunk.source_ref}
                        </span>
                      )}
                      {similarity !== undefined && (
                        <span style={{
                          fontSize: '10px', fontWeight: 600,
                          color: '#2ECC71',
                          background: 'rgba(46,204,113,.1)',
                          padding: '2px 8px', borderRadius: '20px',
                        }}>
                          {Math.round(similarity * 100)}% similarité
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => deleteChunk(chunk.id)}
                      disabled={deleting === chunk.id}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#454D66', fontSize: '16px', flexShrink: 0,
                        opacity: deleting === chunk.id ? .4 : 1,
                        transition: 'color 150ms',
                      }}
                      title="Supprimer"
                    >
                      ×
                    </button>
                  </div>

                  <p style={{
                    fontSize: '13px', lineHeight: '1.6', color: '#C8CDD8',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {chunk.content}
                  </p>

                  <div style={{ fontSize: '10px', color: '#454D66', marginTop: '10px', fontFamily: 'monospace' }}>
                    {formatDate(chunk.created_at)} · {chunk.id.slice(0, 8)}...
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
