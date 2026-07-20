/**
 * Template dashboard agent — Teamovia
 * Design system : design.json (light mode)
 * Usage : copier ce fichier et remplacer les valeurs AGENT_* 
 */

'use client'

import { useState, useEffect, useCallback } from 'react'

// ─────────────────────────────────────────────────────────────
// CONFIG AGENT — seules ces valeurs changent d'un agent à l'autre
// ─────────────────────────────────────────────────────────────

const AGENT = {
  name:    'Lina',                    // Nom de l'agent
  role:    'Agent Support',           // Rôle court
  emoji:   '💬',                      // Emoji avatar
  color:   '#1E3A8A',                 // Couleur spécialité (primaire)
  colorBg: '#EEF2FF',                 // Couleur fond avatar
  tags:    ['Tickets', 'Résolution', 'Satisfaction'],
}

const API_URL         = 'http://127.0.0.1:8000/v1'
const WORKSPACE_TOKEN = 'b5299bf5-ad3a-4072-966e-8d4f4e94396e'

// ─────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────

const T = {
  // Couleurs
  bg:          '#FAFAF7',
  surface:     '#FFFFFF',
  surfaceAlt:  '#F4F2EC',
  textPrimary: '#0B0F1A',
  textSecond:  '#5A6472',
  border:      '#E7E4DC',
  primary:     '#1E3A8A',
  primaryHov:  '#172E6E',
  accent:      '#F59E0B',
  accentSoft:  '#FEF3C7',
  success:     '#16A34A',
  danger:      '#DC2626',
  // Typographie
  fontHead:    "'Plus Jakarta Sans', system-ui, sans-serif",
  fontBody:    "'Inter', system-ui, sans-serif",
  // Rayons
  radius:      '12px',
  radiusSm:    '8px',
  radiusBtn:   '10px',
  radiusFull:  '999px',
  // Ombres
  shadow:      '0 1px 2px rgba(11,15,26,.04), 0 8px 24px rgba(11,15,26,.06)',
  shadowSm:    '0 1px 2px rgba(11,15,26,.06)',
}

// ─────────────────────────────────────────────────────────────
// COMPOSANTS PARTAGÉS
// ─────────────────────────────────────────────────────────────

function AgentAvatar({ size = 48 }: { size?: number }) {
  return (
    <div style={{
      width:           size,
      height:          size,
      borderRadius:    '50%',
      background:      AGENT.colorBg,
      border:          `2px solid ${AGENT.color}22`,
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'center',
      fontSize:        size * 0.46,
      flexShrink:      0,
    }}>
      {AGENT.emoji}
    </div>
  )
}

function Badge({ label }: { label: string }) {
  return (
    <span style={{
      background:   T.accentSoft,
      color:        '#92400E',
      borderRadius: T.radiusFull,
      padding:      '3px 10px',
      fontSize:     '12px',
      fontWeight:   500,
      fontFamily:   T.fontBody,
      whiteSpace:   'nowrap',
    }}>
      {label}
    </span>
  )
}

function StatusDot({ online }: { online: boolean }) {
  return (
    <span style={{
      display:      'inline-block',
      width:        7, height: 7,
      borderRadius: '50%',
      background:   online ? T.success : T.textSecond,
      flexShrink:   0,
    }} />
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background:   T.surface,
      border:       `1px solid ${T.border}`,
      borderRadius: T.radius,
      boxShadow:    T.shadow,
      ...style,
    }}>
      {children}
    </div>
  )
}

function ButtonPrimary({
  children, onClick, disabled, loading,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  loading?:  boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        background:    disabled || loading ? '#93A8D4' : T.primary,
        color:         '#FFFFFF',
        border:        'none',
        borderRadius:  T.radiusBtn,
        padding:       '10px 20px',
        fontSize:      '14px',
        fontWeight:    600,
        fontFamily:    T.fontBody,
        cursor:        disabled || loading ? 'not-allowed' : 'pointer',
        transition:    '200ms ease-out',
        display:       'flex',
        alignItems:    'center',
        gap:           '6px',
      }}
    >
      {loading ? '...' : children}
    </button>
  )
}


function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <div style={{
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      padding:        '64px 24px',
      gap:            '12px',
      color:          T.textSecond,
    }}>
      <span style={{ fontSize: '40px', opacity: .5 }}>{icon}</span>
      <p style={{ fontSize: '15px', fontWeight: 600, color: T.textPrimary, fontFamily: T.fontHead }}>{title}</p>
      {subtitle && <p style={{ fontSize: '13px', color: T.textSecond }}>{subtitle}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// SIDEBAR NAVIGATION
// ─────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { href: '/support',    emoji: '💬', label: 'Lina',   role: 'Support',        color: '#1E3A8A' },
  { href: '/sales',      emoji: '📈', label: 'Noah',   role: 'Sales',          color: '#D97706' },
  { href: '/ava',        emoji: '✨', label: 'Ava',    role: 'Conversationnel', color: '#0891B2' },
  { href: '/milo',       emoji: '✍️', label: 'Milo',   role: 'Contenu',        color: '#D97706' },
  { href: '/sara',       emoji: '⚙️', label: 'Sara',   role: 'Ops',            color: '#16A34A' },
  { href: '/kb',         emoji: '🧠', label: 'KB',     role: 'Base de connaissances', color: '#7C3AED' },
  { href: '/monitoring', emoji: '📊', label: 'Monitoring', role: 'Supervision', color: '#5A6472' },
]

function Sidebar({ currentPath }: { currentPath: string }) {
  return (
    <div style={{
      width:       '220px',
      flexShrink:  0,
      background:  T.surface,
      borderRight: `1px solid ${T.border}`,
      display:     'flex',
      flexDirection: 'column',
      height:      '100vh',
      position:    'sticky',
      top:         0,
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 20px 16px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: 32, height: 32, borderRadius: '8px',
            background: T.primary,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '16px',
          }}>🤖</div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, fontFamily: T.fontHead, color: T.textPrimary }}>
              Teamovia
            </div>
            <div style={{ fontSize: '11px', color: T.textSecond }}>Dashboard</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
        <div style={{ fontSize: '10px', fontWeight: 600, color: T.textSecond, textTransform: 'uppercase', letterSpacing: '.06em', padding: '4px 10px 8px' }}>
          Agents
        </div>
        {NAV_ITEMS.map(item => {
          const isActive = currentPath === item.href
          return (
            <a
              key={item.href}
              href={item.href}
              style={{
                display:       'flex',
                alignItems:    'center',
                gap:           '10px',
                padding:       '8px 10px',
                borderRadius:  T.radiusSm,
                textDecoration: 'none',
                background:    isActive ? `${item.color}12` : 'transparent',
                borderLeft:    isActive ? `3px solid ${item.color}` : '3px solid transparent',
                marginBottom:  '2px',
                transition:    '200ms ease-out',
              }}
            >
              <span style={{
                width: 28, height: 28, borderRadius: '7px',
                background: isActive ? `${item.color}20` : T.surfaceAlt,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', flexShrink: 0,
              }}>{item.emoji}</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: isActive ? 600 : 500, color: isActive ? item.color : T.textPrimary, fontFamily: T.fontBody }}>
                  {item.label}
                </div>
                <div style={{ fontSize: '10px', color: T.textSecond }}>{item.role}</div>
              </div>
            </a>
          )
        })}
      </nav>

      {/* Workspace */}
      <div style={{ padding: '12px 14px', borderTop: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: T.primary, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '11px', fontWeight: 700, flexShrink: 0,
        }}>MD</div>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: T.textPrimary }}>Menuiserie Dubois</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <StatusDot online={true} />
            <span style={{ fontSize: '10px', color: T.textSecond }}>En ligne</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// PAGE HEADER AGENT
// ─────────────────────────────────────────────────────────────

function AgentHeader({
  stat, statLabel, action,
}: {
  stat?: string | number
  statLabel?: string
  action?: React.ReactNode
}) {
  return (
    <div style={{
      padding:         '20px 28px',
      background:      T.surface,
      borderBottom:    `1px solid ${T.border}`,
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'space-between',
      gap:             '16px',
      flexShrink:      0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <AgentAvatar size={44} />
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '18px', fontWeight: 700, fontFamily: T.fontHead, color: T.textPrimary }}>
              {AGENT.name}
            </h1>
            <span style={{ fontSize: '12px', color: T.textSecond, fontStyle: 'italic' }}>{AGENT.role}</span>
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            {AGENT.tags.map(tag => <Badge key={tag} label={tag} />)}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        {stat !== undefined && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: T.fontHead, color: AGENT.color }}>{stat}</div>
            <div style={{ fontSize: '11px', color: T.textSecond }}>{statLabel}</div>
          </div>
        )}
        {action}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ZONE DE CONTENU — à remplacer par le contenu spécifique
// ─────────────────────────────────────────────────────────────

function AgentContent() {
  const [items,   setItems]   = useState<any[]>([])
  const [active,  setActive]  = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // TODO : remplacer par la vraie route de l'agent
      const res  = await fetch(`${API_URL}/agents/support/sessions`, {
        headers: { 'x-workspace-token': WORKSPACE_TOKEN },
      })
      const data = await res.json()
      setItems(data.sessions ?? [])
    } catch { } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = items.filter(item =>
    !search || JSON.stringify(item).toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

      {/* Colonne liste */}
      <div style={{
        width:       '300px',
        flexShrink:  0,
        borderRight: `1px solid ${T.border}`,
        display:     'flex',
        flexDirection: 'column',
        overflowY:   'auto',
        background:  T.bg,
      }}>
        {/* Recherche */}
        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.border}` }}>
          <input
            type="text"
            placeholder="Rechercher..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width:        '100%',
              background:   T.surface,
              border:       `1px solid ${T.border}`,
              borderRadius: T.radiusSm,
              padding:      '8px 12px',
              fontSize:     '13px',
              color:        T.textPrimary,
              fontFamily:   T.fontBody,
              outline:      'none',
              boxSizing:    'border-box',
            }}
          />
        </div>

        {/* Items */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: T.textSecond, fontSize: '13px' }}>
              Chargement...
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={AGENT.emoji} title="Aucun élément" subtitle="Les données apparaîtront ici." />
          ) : filtered.map((item, i) => (
            <button
              key={item.id ?? i}
              onClick={() => setActive(item)}
              style={{
                width:       '100%',
                textAlign:   'left',
                padding:     '12px 14px',
                background:  active?.id === item.id ? `${AGENT.color}08` : 'transparent',
                borderLeft:  active?.id === item.id ? `3px solid ${AGENT.color}` : '3px solid transparent',
                border:      'none',
                borderBottom: `1px solid ${T.border}`,
                cursor:      'pointer',
                transition:  '200ms ease-out',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600, color: T.textPrimary, fontFamily: T.fontBody }}>
                {item.user_ref ?? item.name ?? item.id?.slice(0, 8)}
              </div>
              <div style={{ fontSize: '11px', color: T.textSecond, marginTop: '3px' }}>
                {item.status ?? item.source ?? '—'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Zone détail */}
      <div style={{ flex: 1, overflowY: 'auto', background: T.bg }}>
        {active ? (
          <div style={{ padding: '24px 28px' }}>
            <Card style={{ padding: '24px' }}>
              <pre style={{ fontSize: '12px', color: T.textSecond, fontFamily: 'monospace', overflowX: 'auto' }}>
                {JSON.stringify(active, null, 2)}
              </pre>
            </Card>
          </div>
        ) : (
          <EmptyState
            icon={AGENT.emoji}
            title={`Sélectionner un élément`}
            subtitle="Cliquez sur un élément dans la liste pour voir les détails."
          />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// PAGE PRINCIPALE
// ─────────────────────────────────────────────────────────────

export default function AgentPage() {
  return (
    <div style={{
      display:    'flex',
      height:     '100vh',
      background: T.bg,
      fontFamily: T.fontBody,
      color:      T.textPrimary,
      overflow:   'hidden',
    }}>
      <Sidebar currentPath="/support" />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AgentHeader
          stat={0}
          statLabel="ouvertes"
          action={<ButtonPrimary>Nouvelle session</ButtonPrimary>}
        />
        <AgentContent />
      </div>
    </div>
  )
}
