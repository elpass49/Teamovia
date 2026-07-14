'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import styles from './sales.module.css'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type Lead = {
  id: string
  email: string
  name: string
  company: string | null
  phone: string | null
  source: string
  status: 'new' | 'qualifying' | 'qualified' | 'transferred' | 'lost'
  score: number | null
  score_data: Record<string, any> | null
  data: Record<string, unknown>
  created_at: string
  updated_at: string
}

type LeadMessage = {
  id: string
  lead_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

type FilterState = {
  status: 'all' | Lead['status']
  searchQuery: string
  minScore: number | null
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getScoreBadgeColor(score: number | null): string {
  if (score === null) return 'gray'
  if (score >= 75) return 'green'
  if (score >= 50) return 'orange'
  return 'red'
}

function getScoreBadgeLabel(score: number | null): string {
  if (score === null) return 'N/A'
  return `${Math.round(score)}`
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('fr-FR', {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  })
}

// ─────────────────────────────────────────────────────────────
// Lead List Item
// ─────────────────────────────────────────────────────────────

function LeadItem({
  lead,
  isActive,
  onClick,
}: {
  lead: Lead
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      className={`${styles.leadItem} ${isActive ? styles.active : ''}`}
      onClick={onClick}
    >
      <div className={styles.leadItemHeader}>
        <div className={styles.leadItemName}>{lead.name || 'Sans nom'}</div>
        <div className={`${styles.scoreBadge} ${styles[`badge_${getScoreBadgeColor(lead.score)}`]}`}>
          {getScoreBadgeLabel(lead.score)}
        </div>
      </div>
      <div className={styles.leadItemEmail}>{lead.email}</div>
      <div className={styles.leadItemMeta}>
        <span className={styles.leadItemSource}>{lead.source}</span>
        <span className={styles.leadItemStatus}>{lead.status}</span>
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────
// Lead Detail
// ─────────────────────────────────────────────────────────────

function LeadDetail({
  lead,
  messages,
  onQualify,
  onReject,
  onSyncCRM,
  onQualifyAI,
  isLoading,
}: {
  lead: Lead
  messages: LeadMessage[]
  onQualify: () => void
  onReject: () => void
  onSyncCRM: () => void
  onQualifyAI: () => void
  isLoading: boolean
}) {
  return (
    <div className={styles.detailPanel}>
      {/* Header */}
      <div className={styles.detailHeader}>
        <div>
          <h2 className={styles.detailName}>{lead.name || 'Sans nom'}</h2>
          <div className={styles.detailEmail}>{lead.email}</div>
        </div>
        <div className={`${styles.scoreBadgeLarge} ${styles[`badge_${getScoreBadgeColor(lead.score)}`]}`}>
          {getScoreBadgeLabel(lead.score)}
        </div>
      </div>

      {/* Meta */}
      <div className={styles.detailMeta}>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Entreprise</span>
          <span className={styles.metaValue}>{lead.company || '—'}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Téléphone</span>
          <span className={styles.metaValue}>{lead.phone || '—'}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Source</span>
          <span className={styles.metaValue}>{lead.source}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Statut</span>
          <span className={styles.metaValue}>{lead.status}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Créé</span>
          <span className={styles.metaValue}>{formatDate(lead.created_at)}</span>
        </div>
      </div>

      {/* Dimensions (si score disponible) */}
      {lead.score_data?.dimensions && (
        <div className={styles.dimensions}>
          <h3 className={styles.dimensionsTitle}>Dimensions</h3>
          <div className={styles.dimensionsList}>
            {Object.entries(lead.score_data.dimensions).map(([key, value]) => (
              <div key={key} className={styles.dimensionItem}>
                <span className={styles.dimensionLabel}>{key}</span>
                <div className={styles.dimensionBar}>
                  <div
                    className={styles.dimensionFill}
                    style={{ width: `${value}%` }}
                  />
                </div>
                <span className={styles.dimensionValue}>{Math.round(Number(value))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {messages.length > 0 && (
        <div className={styles.messagesSection}>
          <h3 className={styles.messagesTitle}>Historique qualification</h3>
          <div className={styles.messagesList}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`${styles.message} ${styles[`message_${msg.role}`]}`}
              >
                <div className={styles.messageRole}>
                  {msg.role === 'user' ? '👤' : '🤖'}
                </div>
                <div className={styles.messageContent}>{msg.content}</div>
                <div className={styles.messageTime}>
                  {formatDate(msg.created_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Score Data */}
      {lead.score_data && (
        <div className={styles.scoreDataSection}>
          {lead.score_data.reasons && lead.score_data.reasons.length > 0 && (
            <div className={styles.scoreDataBlock}>
              <h4 className={styles.scoreDataTitle}>Raisons du score</h4>
              <ul className={styles.scoreDataList}>
                {lead.score_data.reasons.map((reason: string, i: number) => (
                  <li key={i}>✓ {reason}</li>
                ))}
              </ul>
            </div>
          )}

          {lead.score_data.disqualifiers &&
            lead.score_data.disqualifiers.length > 0 && (
              <div className={styles.scoreDataBlock}>
                <h4 className={styles.scoreDataTitle}>Obstacles potentiels</h4>
                <ul className={styles.scoreDataList}>
                  {lead.score_data.disqualifiers.map(
                    (disq: string, i: number) => (
                      <li key={i}>⚠️ {disq}</li>
                    )
                  )}
                </ul>
              </div>
            )}

          {lead.score_data.next_step && (
            <div className={styles.scoreDataBlock}>
              <h4 className={styles.scoreDataTitle}>Prochaine étape</h4>
              <p className={styles.nextStep}>{lead.score_data.next_step}</p>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className={styles.actions}>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
          onClick={onQualify}
          disabled={isLoading}
        >
          Qualifier
        </button>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
          onClick={onReject}
          disabled={isLoading}
        >
          Rejeter
        </button>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
          onClick={onQualifyAI}
          disabled={isLoading}
        >
          Qualifier (IA)
        </button>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
          onClick={onSyncCRM}
          disabled={isLoading}
        >
          Sync CRM
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────

export default function SalesPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [messages, setMessages] = useState<LeadMessage[]>([])
  const [filters, setFilters] = useState<FilterState>({
    status: 'all',
    searchQuery: '',
    minScore: null,
  })
  const [isLoading, setIsLoading] = useState(false)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // ── Récupérer les leads ──────────────────────────────────
  const fetchLeads = useCallback(async () => {
    try {
      const query = supabase
        .from('leads')
        .select('*')
        .order('score', { ascending: false, nullsFirst: false })

      if (filters.status !== 'all') {
        query.eq('status', filters.status)
      }

      if (filters.searchQuery) {
        query.or(
          `email.ilike.%${filters.searchQuery}%,name.ilike.%${filters.searchQuery}%`
        )
      }

      if (filters.minScore !== null) {
        query.gte('score', filters.minScore)
      }

      const { data, error } = await query

      if (!error && data) {
        setLeads(data as Lead[])
      }
    } catch (err) {
      console.error('Erreur récupération leads:', err)
    }
  }, [supabase, filters])

  // ── Récupérer les messages d'un lead ─────────────────────
  const fetchMessages = useCallback(
    async (leadId: string) => {
      try {
        const { data, error } = await supabase
          .from('lead_messages')
          .select('*')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: true })

        if (!error && data) {
          setMessages(data as LeadMessage[])
        }
      } catch (err) {
        console.error('Erreur récupération messages:', err)
      }
    },
    [supabase]
  )

  // ── Setup realtime ───────────────────────────────────────
  useEffect(() => {
    fetchLeads()

    const subscription = supabase
      .channel('leads')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads' },
        () => {
          fetchLeads()
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [fetchLeads, supabase])

  // ── Sélection lead ───────────────────────────────────────
  const handleSelectLead = useCallback(
    (lead: Lead) => {
      setSelectedLead(lead)
      fetchMessages(lead.id)
    },
    [fetchMessages]
  )

  // ── Actions ──────────────────────────────────────────────
  const handleQualify = async () => {
    if (!selectedLead) return
    setIsLoading(true)
    try {
      const res = await fetch(
        `/api/agents/sales/leads/${selectedLead.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'qualified' }),
        }
      )
      if (res.ok) {
        const updated = await res.json()
        setSelectedLead(updated)
        fetchLeads()
      }
    } catch (err) {
      console.error('Erreur qualification:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleReject = async () => {
    if (!selectedLead) return
    setIsLoading(true)
    try {
      const res = await fetch(
        `/api/agents/sales/leads/${selectedLead.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'lost' }),
        }
      )
      if (res.ok) {
        const updated = await res.json()
        setSelectedLead(updated)
        fetchLeads()
      }
    } catch (err) {
      console.error('Erreur rejet:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleQualifyAI = async () => {
    if (!selectedLead) return
    setIsLoading(true)
    try {
      const res = await fetch(
        `/api/agents/sales/leads/${selectedLead.id}/qualify`,
        { method: 'POST' }
      )
      if (res.ok) {
        fetchLeads()
        handleSelectLead(selectedLead)
      }
    } catch (err) {
      console.error('Erreur qualification IA:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSyncCRM = async () => {
    if (!selectedLead) return
    setIsLoading(true)
    try {
      await fetch(
        `/api/agents/sales/leads/${selectedLead.id}/sync-crm`,
        { method: 'POST' }
      )
    } catch (err) {
      console.error('Erreur sync CRM:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // ── Filtre leads ─────────────────────────────────────────
  const filteredLeads = leads.filter((lead) => {
    if (filters.status !== 'all' && lead.status !== filters.status) {
      return false
    }
    if (
      filters.searchQuery &&
      !lead.email.includes(filters.searchQuery) &&
      !lead.name.includes(filters.searchQuery)
    ) {
      return false
    }
    if (
      filters.minScore !== null &&
      (lead.score === null || lead.score < filters.minScore)
    ) {
      return false
    }
    return true
  })

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Pipeline Ventes</h1>
      </div>

      <div className={styles.container}>
        {/* Colonne gauche : liste leads */}
        <div className={styles.listPanel}>
          <div className={styles.filters}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Rechercher..."
              value={filters.searchQuery}
              onChange={(e) =>
                setFilters({ ...filters, searchQuery: e.target.value })
              }
            />

            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Statut</label>
              <select
                className={styles.filterSelect}
                value={filters.status}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    status: e.target.value as FilterState['status'],
                  })
                }
              >
                <option value="all">Tous</option>
                <option value="new">Nouveau</option>
                <option value="qualifying">Qualification</option>
                <option value="qualified">Qualifié</option>
                <option value="transferred">Transféré</option>
                <option value="lost">Perdu</option>
              </select>
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Score min</label>
              <input
                type="number"
                className={styles.filterInput}
                placeholder="0-100"
                min="0"
                max="100"
                value={filters.minScore ?? ''}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    minScore: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </div>
          </div>

          <div className={styles.leadsList}>
            {filteredLeads.length === 0 ? (
              <div className={styles.emptyState}>Aucun lead</div>
            ) : (
              filteredLeads.map((lead) => (
                <LeadItem
                  key={lead.id}
                  lead={lead}
                  isActive={selectedLead?.id === lead.id}
                  onClick={() => handleSelectLead(lead)}
                />
              ))
            )}
          </div>
        </div>

        {/* Colonne droite : détail lead */}
        <div className={styles.detailPanelContainer}>
          {selectedLead ? (
            <LeadDetail
              lead={selectedLead}
              messages={messages}
              onQualify={handleQualify}
              onReject={handleReject}
              onQualifyAI={handleQualifyAI}
              onSyncCRM={handleSyncCRM}
              isLoading={isLoading}
            />
          ) : (
            <div className={styles.emptyDetail}>Sélectionner un lead</div>
          )}
        </div>
      </div>
    </div>
  )
}
