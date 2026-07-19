/**
 * DashboardShell — Layout partagé entre toutes les pages agent
 * Avec images des agents dans la sidebar et le header
 */

'use client'

import { usePathname } from 'next/navigation'
import Image from 'next/image'

// ─────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────

export const T = {
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
  fontHead:    "'Plus Jakarta Sans', system-ui, sans-serif",
  fontBody:    "'Inter', system-ui, sans-serif",
  radius:      '12px',
  radiusSm:    '8px',
  radiusBtn:   '10px',
  radiusFull:  '999px',
  shadow:      '0 1px 2px rgba(11,15,26,.04), 0 8px 24px rgba(11,15,26,.06)',
}

// ─────────────────────────────────────────────────────────────
// Config des agents
// ─────────────────────────────────────────────────────────────

export const AGENTS = [
  { href:'/support', label:'Lina', role:'Support',         color:'#1E3A8A', image:'/agents/lina.png', tags:['Tickets','Résolution','Satisfaction'] },
  { href:'/sales',   label:'Noah', role:'Sales',           color:'#D97706', image:'/agents/noah.png', tags:['Pipeline','Relances','Propositions'] },
  { href:'/ava',     label:'Ava',  role:'Conversationnel', color:'#0891B2', image:'/agents/ava.png',  tags:['Chat','Qualification','Engagement'] },
  { href:'/milo',    label:'Milo', role:'Contenu',         color:'#D97706', image:'/agents/milo.png', tags:['Rédaction','Campagnes','Social media'] },
  { href:'/sara',    label:'Sara', role:'Ops',             color:'#16A34A', image:'/agents/sara.png', tags:['Workflows','Onboarding','Coordination'] },
  { href:'/kb',      label:'KB',   role:'Connaissances',   color:'#7C3AED', image:null,               tags:['RAG','Vecteurs','Documents'] },
  { href:'/monitoring', label:'Stats',  role:'Monitoring', color:'#5A6472', image:null,               tags:['Sessions','Leads','Latence'] },
  { href:'/settings',   label:'Config', role:'Paramètres', color:'#5A6472', image:null,               tags:['Workspace','Membres','Agents'] },
]

// ─────────────────────────────────────────────────────────────
// Composants partagés exportés
// ─────────────────────────────────────────────────────────────

export function Badge({ label, color }: { label: string; color?: string }) {
  return (
    <span style={{
      background:   color ? `${color}18` : T.accentSoft,
      color:        color ?? '#92400E',
      borderRadius: T.radiusFull,
      padding:      '3px 10px',
      fontSize:     '11px',
      fontWeight:   500,
      whiteSpace:   'nowrap',
      border:       `1px solid ${color ? `${color}30` : '#F59E0B40'}`,
    }}>
      {label}
    </span>
  )
}

export function Card({ children, style, padding = '20px' }: {
  children: React.ReactNode
  style?:   React.CSSProperties
  padding?: string
}) {
  return (
    <div style={{
      background:   T.surface,
      border:       `1px solid ${T.border}`,
      borderRadius: T.radius,
      boxShadow:    T.shadow,
      padding,
      ...style,
    }}>
      {children}
    </div>
  )
}

export function Btn({
  children, onClick, disabled, loading, variant = 'primary', size = 'md',
}: {
  children:  React.ReactNode
  onClick?:  () => void
  disabled?: boolean
  loading?:  boolean
  variant?:  'primary' | 'accent' | 'ghost' | 'danger'
  size?:     'sm' | 'md'
}) {
  const bg: Record<string, string> = {
    primary: disabled || loading ? '#93A8D4' : T.primary,
    accent:  T.accent,
    ghost:   'transparent',
    danger:  T.danger,
  }
  const color: Record<string, string> = {
    primary: '#fff',
    accent:  '#0B0F1A',
    ghost:   T.textSecond,
    danger:  '#fff',
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        background:   bg[variant],
        color:        color[variant],
        border:       variant === 'ghost' ? `1px solid ${T.border}` : 'none',
        borderRadius: T.radiusBtn,
        padding:      size === 'sm' ? '6px 14px' : '9px 18px',
        fontSize:     size === 'sm' ? '12px' : '13px',
        fontWeight:   600,
        cursor:       disabled || loading ? 'not-allowed' : 'pointer',
        transition:   '200ms ease-out',
        opacity:      disabled ? .6 : 1,
        display:      'flex',
        alignItems:   'center',
        gap:          '6px',
        whiteSpace:   'nowrap',
        fontFamily:   T.fontBody,
      }}
    >
      {loading ? '...' : children}
    </button>
  )
}

export function EmptyState({ icon, title, subtitle }: {
  icon: string; title: string; subtitle?: string
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '64px 24px', gap: '10px',
    }}>
      <span style={{ fontSize: '36px', opacity: .4 }}>{icon}</span>
      <p style={{ fontSize: '14px', fontWeight: 600, color: T.textPrimary, fontFamily: T.fontHead }}>{title}</p>
      {subtitle && <p style={{ fontSize: '12px', color: T.textSecond }}>{subtitle}</p>}
    </div>
  )
}

export function Input({ value, onChange, placeholder, style }: {
  value:        string
  onChange:     (v: string) => void
  placeholder?: string
  style?:       React.CSSProperties
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        background:   T.surface,
        border:       `1px solid ${T.border}`,
        borderRadius: T.radiusSm,
        padding:      '8px 12px',
        fontSize:     '13px',
        color:        T.textPrimary,
        outline:      'none',
        width:        '100%',
        fontFamily:   T.fontBody,
        transition:   '200ms ease-out',
        boxSizing:    'border-box' as const,
        ...style,
      }}
    />
  )
}

// ─────────────────────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────────────────────

function Sidebar() {
  const pathname = usePathname()

  return (
    <div style={{
      width:         '210px',
      flexShrink:    0,
      background:    T.surface,
      borderRight:   `1px solid ${T.border}`,
      display:       'flex',
      flexDirection: 'column',
      height:        '100vh',
      position:      'sticky',
      top:           0,
    }}>
      {/* Logo */}
      <div style={{ padding: '18px 16px 14px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: 30, height: 30, borderRadius: '8px',
            background: T.primary, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '15px',
          }}>🤖</div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, fontFamily: T.fontHead, color: T.textPrimary }}>Teamovia</div>
            <div style={{ fontSize: '10px', color: T.textSecond }}>Agents IA</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
        <div style={{ fontSize: '10px', fontWeight: 600, color: T.textSecond, textTransform: 'uppercase', letterSpacing: '.06em', padding: '4px 8px 8px' }}>
          Agents
        </div>
        {AGENTS.map(item => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
          return (
            <a key={item.href} href={item.href} style={{
              display:        'flex',
              alignItems:     'center',
              gap:            '9px',
              padding:        '6px 8px',
              borderRadius:   T.radiusSm,
              background:     isActive ? `${item.color}10` : 'transparent',
              borderLeft:     isActive ? `3px solid ${item.color}` : '3px solid transparent',
              marginBottom:   '1px',
              transition:     '200ms ease-out',
              textDecoration: 'none',
            }}>
              {/* Avatar sidebar — image ou fallback */}
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: isActive ? `${item.color}18` : T.surfaceAlt,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, overflow: 'hidden',
                border: isActive ? `1.5px solid ${item.color}30` : 'none',
              }}>
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.label}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
                  />
                ) : (
                  <span style={{ fontSize: '13px', color: isActive ? item.color : T.textSecond }}>
                    {item.label[0]}
                  </span>
                )}
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: isActive ? 600 : 500, color: isActive ? item.color : T.textPrimary }}>
                  {item.label}
                </div>
                <div style={{ fontSize: '10px', color: T.textSecond }}>{item.role}</div>
              </div>
            </a>
          )
        })}
      </nav>

      {/* Workspace */}
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          width: 26, height: 26, borderRadius: '50%',
          background: T.primary, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '10px', fontWeight: 700, flexShrink: 0,
        }}>MD</div>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: T.textPrimary }}>Menuiserie Dubois</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.success, display: 'inline-block' }} />
            <span style={{ fontSize: '10px', color: T.textSecond }}>En ligne</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Agent Page Header — avec image de l'agent
// ─────────────────────────────────────────────────────────────

export function AgentHeader({
  label, role, color, tags, image,
  stat, statLabel, action,
}: {
  label:      string
  role:       string
  color:      string
  tags:       string[]
  image?:     string | null
  stat?:      string | number
  statLabel?: string
  action?:    React.ReactNode
}) {
  return (
    <div style={{
      padding:        '0 24px 0 0',
      background:     T.surface,
      borderBottom:   `1px solid ${T.border}`,
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      gap:            '16px',
      flexShrink:     0,
      minHeight:      '88px',
      overflow:       'hidden',
    }}>
      {/* Image agent + infos */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px' }}>
        {/* Image agent */}
        {image && (
          <div style={{
            width:    90,
            height:   88,
            flexShrink: 0,
            position: 'relative',
            overflow: 'hidden',
          }}>
            <img
              src={image}
              alt={label}
              style={{
                width:      '100%',
                height:     '100%',
                objectFit:  'contain',
                objectPosition: 'bottom',
                display:    'block',
              }}
            />
          </div>
        )}

        {/* Texte */}
        <div style={{ paddingTop: '20px', paddingBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <h1 style={{ fontSize: '18px', fontWeight: 700, fontFamily: T.fontHead, color: T.textPrimary }}>{label}</h1>
            <span style={{ fontSize: '12px', color: T.textSecond }}>{role}</span>
          </div>
          <div style={{ display: 'flex', gap: '5px', marginTop: '6px', flexWrap: 'wrap' }}>
            {tags.map(tag => <Badge key={tag} label={tag} color={color} />)}
          </div>
        </div>
      </div>

      {/* Stat + action */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
        {stat !== undefined && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: T.fontHead, color }}>{stat}</div>
            <div style={{ fontSize: '11px', color: T.textSecond }}>{statLabel}</div>
          </div>
        )}
        {action}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Shell principal
// ─────────────────────────────────────────────────────────────

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display:    'flex',
      height:     '100vh',
      background: T.bg,
      fontFamily: T.fontBody,
      color:      T.textPrimary,
      overflow:   'hidden',
    }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {children}
      </div>
    </div>
  )
}
