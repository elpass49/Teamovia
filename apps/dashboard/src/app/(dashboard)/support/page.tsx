/**
 * /support — Dashboard opérateur Agent Support
 * Page principale : liste des sessions + vue conversation
 *
 * Architecture :
 *   - Colonne gauche  : liste filtrée des sessions
 *   - Colonne droite  : conversation active + actions
 *
 * Data fetching : Supabase RLS côté client
 * Realtime      : Supabase Realtime sur messages + sessions
 */

'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

// ─────────────────────────────────────────────────────────────
// Types locaux
// ─────────────────────────────────────────────────────────────

type SessionStatus = 'open' | 'resolved' | 'escalated' | 'transferred'

type Session = {
  id:         string
  user_ref:   string | null
  channel:    'chat' | 'email' | 'form'
  status:     SessionStatus
  created_at: string
  updated_at: string
}

type Message = {
  id:          string
  session_id:  string
  role:        'user' | 'assistant' | 'system'
  content:     string
  tokens_used: number | null
  latency_ms:  number | null
  created_at:  string
}

type Filter = SessionStatus | 'all'

// ─────────────────────────────────────────────────────────────
// Constantes UI
// ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<SessionStatus, string> = {
  open:        'Ouverte',
  resolved:    'Résolue',
  escalated:   'Escaladée',
  transferred: 'Transférée',
}

const STATUS_COLOR: Record<SessionStatus, string> = {
  open:        '#4F6EF7',
  resolved:    '#2ECC71',
  escalated:   '#E74C3C',
  transferred: '#F39C12',
}

const CHANNEL_ICON: Record<string, string> = {
  chat:  '💬',
  email: '✉️',
  form:  '📋',
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000)   return "À l'instant"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function formatFullTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit',
  })
}

function displayUserRef(ref: string | null): string {
  if (!ref) return 'Visiteur anonyme'
  if (ref.includes('@')) return ref
  return `#${ref.slice(0, 8)}`
}

// ─────────────────────────────────────────────────────────────
// Composant SessionRow
// ─────────────────────────────────────────────────────────────

function SessionRow({
  session,
  isActive,
  onClick,
}: {
  session:  Session
  isActive: boolean
  onClick:  () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '12px 16px',
        background: isActive ? 'rgba(79,110,247,.12)' : 'transparent',
        border: 'none',
        borderLeft: isActive ? '3px solid #4F6EF7' : '3px solid transparent',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        transition: 'background 150ms ease',
      }}
    >
      {/* Icône canal */}
      <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>
        {CHANNEL_ICON[session.channel] ?? '💬'}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Identifiant + temps */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontSize: '13px', fontWeight: 600,
            color: '#E8EAEE',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {displayUserRef(session.user_ref)}
          </span>
          <span style={{ fontSize: '10px', color: '#454D66', flexShrink: 0, fontFamily: 'monospace' }}>
            {formatTime(session.updated_at)}
          </span>
        </div>

        {/* Badge statut */}
        <div style={{ marginTop: '4px' }}>
          <span style={{
            fontSize: '10px',
            fontWeight: 600,
            color: STATUS_COLOR[session.status],
            background: `${STATUS_COLOR[session.status]}1A`,
            padding: '2px 7px',
            borderRadius: '20px',
            textTransform: 'uppercase',
            letterSpacing: '.04em',
          }}>
            {STATUS_LABEL[session.status]}
          </span>
        </div>
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────
// Composant MessageBubble
// ─────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === 'system') {
    return (
      <div style={{
        alignSelf: 'center', fontSize: '11px',
        color: '#454D66', textAlign: 'center',
        padding: '4px 12px',
        background: '#1E2336',
        borderRadius: '20px',
        border: '1px solid #2A3048',
      }}>
        {msg.content}
      </div>
    )
  }

  const isUser = msg.role === 'user'

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      alignSelf: isUser ? 'flex-end' : 'flex-start',
      maxWidth: '80%',
      gap: '4px',
    }}>
      <div style={{
        padding: '10px 14px',
        borderRadius: '14px',
        borderBottomRightRadius: isUser ? '3px' : '14px',
        borderBottomLeftRadius:  isUser ? '14px' : '3px',
        background: isUser ? '#1E2E6B' : '#1E2336',
        border: isUser ? 'none' : '1px solid #2A3048',
        fontSize: '13.5px',
        lineHeight: '1.55',
        color: '#E8EAEE',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {msg.content}
      </div>

      {/* Méta : heure + tokens */}
      <div style={{
        display: 'flex', gap: '8px', alignItems: 'center',
        fontSize: '10px', color: '#454D66', fontFamily: 'monospace',
      }}>
        <span>{formatFullTime(msg.created_at)}</span>
        {msg.tokens_used && <span>{msg.tokens_used} tokens</span>}
        {msg.latency_ms  && <span>{msg.latency_ms}ms</span>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Page principale
// ─────────────────────────────────────────────────────────────

export default function SupportDashboard() {
  const supabase = createClient()

  // ── État ────────────────────────────────────────────────────
  const [sessions,       setSessions]       = useState<Session[]>([])
  const [activeId,       setActiveId]       = useState<string | null>(null)
  const [messages,       setMessages]       = useState<Message[]>([])
  const [filter,         setFilter]         = useState<Filter>('all')
  const [search,         setSearch]         = useState('')
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [updatingStatus,  setUpdatingStatus]  = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const activeSession  = sessions.find(s => s.id === activeId) ?? null

  // ── Charger les sessions ─────────────────────────────────────
  const loadSessions = useCallback(async () => {
    setLoadingSessions(true)
    let q = supabase
      .from('sessions')
      .select('*')
      .order('updated_at', { ascending: false })

    if (filter !== 'all') q = q.eq('status', filter)

    const { data } = await q
    setSessions((data as Session[]) ?? [])
    setLoadingSessions(false)
  }, [filter])

  useEffect(() => { loadSessions() }, [loadSessions])

  // ── Charger les messages d'une session ──────────────────────
  const loadMessages = useCallback(async (sessionId: string) => {
    setLoadingMessages(true)
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    setMessages((data as Message[]) ?? [])
    setLoadingMessages(false)
  }, [])

  useEffect(() => {
    if (activeId) loadMessages(activeId)
    else setMessages([])
  }, [activeId, loadMessages])

  // ── Scroll bas automatique ───────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Realtime : nouveaux messages ────────────────────────────
  useEffect(() => {
    if (!activeId) return

    const channel = supabase
      .channel(`messages:${activeId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'messages',
        filter: `session_id=eq.${activeId}`,
      }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeId])

  // ── Realtime : mises à jour de sessions ─────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('sessions-changes')
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'sessions',
      }, () => { loadSessions() })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [loadSessions])

  // ── Changer le statut d'une session ─────────────────────────
  async function updateStatus(sessionId: string, status: SessionStatus) {
    setUpdatingStatus(true)
    await supabase
      .from('sessions')
      .update({ status })
      .eq('id', sessionId)

    setSessions(prev =>
      prev.map(s => s.id === sessionId ? { ...s, status } : s)
    )
    setUpdatingStatus(false)
  }

  // ── Filtrage par recherche ───────────────────────────────────
  const filteredSessions = sessions.filter(s => {
    if (!search) return true
    const ref = (s.user_ref ?? '').toLowerCase()
    return ref.includes(search.toLowerCase())
  })

  // ─────────────────────────────────────────────────────────────
  // Rendu
  // ─────────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: '#0F1117',
      color: '#E8EAEE',
      fontFamily: "'Inter', system-ui, sans-serif",
      overflow: 'hidden',
    }}>

      {/* ── Colonne gauche : liste des sessions ──────────────── */}
      <div style={{
        width: '300px',
        flexShrink: 0,
        borderRight: '1px solid #2A3048',
        display: 'flex',
        flexDirection: 'column',
        background: '#181C27',
      }}>
        {/* En-tête */}
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid #2A3048' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h1 style={{ fontSize: '15px', fontWeight: 700, color: '#E8EAEE' }}>
              Support
            </h1>
            <span style={{
              fontSize: '11px', fontWeight: 600,
              color: '#4F6EF7',
              background: 'rgba(79,110,247,.12)',
              padding: '2px 8px',
              borderRadius: '20px',
            }}>
              {sessions.filter(s => s.status === 'open').length} ouvertes
            </span>
          </div>

          {/* Recherche */}
          <input
            type="text"
            placeholder="Rechercher…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              background: '#1E2336',
              border: '1px solid #2A3048',
              borderRadius: '8px',
              padding: '8px 12px',
              color: '#E8EAEE',
              fontSize: '12px',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />

          {/* Filtres statut */}
          <div style={{ display: 'flex', gap: '4px', marginTop: '8px', flexWrap: 'wrap' }}>
            {(['all', 'open', 'escalated', 'resolved'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '3px 10px',
                  borderRadius: '20px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 600,
                  background: filter === f ? '#4F6EF7' : '#1E2336',
                  color:      filter === f ? '#fff' : '#7A839A',
                  transition: 'all 150ms ease',
                }}
              >
                {f === 'all' ? 'Toutes' : STATUS_LABEL[f]}
              </button>
            ))}
          </div>
        </div>

        {/* Liste */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingSessions ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#454D66', fontSize: '13px' }}>
              Chargement…
            </div>
          ) : filteredSessions.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#454D66', fontSize: '13px' }}>
              Aucune session
            </div>
          ) : (
            filteredSessions.map(session => (
              <SessionRow
                key={session.id}
                session={session}
                isActive={session.id === activeId}
                onClick={() => setActiveId(session.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Colonne droite : conversation ────────────────────── */}
      {activeSession ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Header conversation */}
          <div style={{
            padding: '16px 24px',
            borderBottom: '1px solid #2A3048',
            background: '#181C27',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexShrink: 0,
          }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#E8EAEE' }}>
                {displayUserRef(activeSession.user_ref)}
              </div>
              <div style={{ fontSize: '11px', color: '#7A839A', marginTop: '2px', fontFamily: 'monospace' }}>
                {CHANNEL_ICON[activeSession.channel]} {activeSession.channel}
                &nbsp;·&nbsp;
                Ouvert le {new Date(activeSession.created_at).toLocaleDateString('fr-FR')}
                &nbsp;·&nbsp;
                <span style={{ color: '#454D66' }}>{activeSession.id.slice(0, 8)}…</span>
              </div>
            </div>

            {/* Actions statut */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {activeSession.status === 'open' && (
                <>
                  <button
                    onClick={() => updateStatus(activeSession.id, 'resolved')}
                    disabled={updatingStatus}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600,
                      background: '#2ECC71',
                      color: '#fff',
                      opacity: updatingStatus ? .5 : 1,
                    }}
                  >
                    Résoudre
                  </button>
                  <button
                    onClick={() => updateStatus(activeSession.id, 'escalated')}
                    disabled={updatingStatus}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      border: '1px solid #E74C3C',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600,
                      background: 'transparent',
                      color: '#E74C3C',
                      opacity: updatingStatus ? .5 : 1,
                    }}
                  >
                    Escalader
                  </button>
                </>
              )}
              {activeSession.status !== 'open' && (
                <span style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: STATUS_COLOR[activeSession.status],
                  background: `${STATUS_COLOR[activeSession.status]}1A`,
                }}>
                  {STATUS_LABEL[activeSession.status]}
                </span>
              )}
            </div>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}>
            {loadingMessages ? (
              <div style={{ textAlign: 'center', color: '#454D66', fontSize: '13px', marginTop: '40px' }}>
                Chargement…
              </div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#454D66', fontSize: '13px', marginTop: '40px' }}>
                Aucun message dans cette session.
              </div>
            ) : (
              messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

      ) : (
        /* État vide */
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '12px',
          color: '#454D66',
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <p style={{ fontSize: '14px' }}>Sélectionner une session</p>
        </div>
      )}
    </div>
  )
}
