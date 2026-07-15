/**
 * /sara — Dashboard Agent Ops Sara
 */

'use client'

import { useState, useEffect } from 'react'

const API_URL         = 'http://127.0.0.1:8000/v1'
const WORKSPACE_TOKEN = 'b5299bf5-ad3a-4072-966e-8d4f4e94396e'

type Workflow = {
  id:          string
  name:        string
  description: string
  trigger:     string
  n8n_url:     string
}

type ActionResult = {
  action:   string
  success:  boolean
  error:    string | null
  workflow: string
}

type LogEntry = {
  id:         string
  event_type: string
  payload:    Record<string, unknown>
  created_at: string
}

const headers = {
  'Content-Type':      'application/json',
  'x-workspace-token': WORKSPACE_TOKEN,
}

export default function SaraPage() {
  const [workflows,     setWorkflows]     = useState<Workflow[]>([])
  const [logs,          setLogs]          = useState<LogEntry[]>([])
  const [loadingWf,     setLoadingWf]     = useState(true)
  const [activeAction,  setActiveAction]  = useState<string | null>(null)
  const [result,        setResult]        = useState<ActionResult | null>(null)
  const [error,         setError]         = useState('')

  // Formulaires
  const [escalateSession,  setEscalateSession]  = useState('')
  const [escalatePriority, setEscalatePriority] = useState<'low'|'normal'|'high'>('high')
  const [leadId,           setLeadId]           = useState('')
  const [leadName,         setLeadName]          = useState('')
  const [leadEmail,        setLeadEmail]         = useState('')
  const [leadScore,        setLeadScore]         = useState(75)
  const [leadProject,      setLeadProject]       = useState('')
  const [leadDaysIdle,     setLeadDaysIdle]      = useState(3)

  useEffect(() => { loadWorkflows(); loadLogs() }, [])

  async function loadWorkflows() {
    try {
      const res  = await fetch(`${API_URL}/agents/sara/workflows`, { headers })
      const data = await res.json()
      setWorkflows(data.workflows ?? [])
    } catch { } finally { setLoadingWf(false) }
  }

  async function loadLogs() {
    try {
      const res  = await fetch(`${API_URL}/knowledge?per_page=1`, { headers })
      // On charge les logs depuis agent_logs via supabase direct
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const { data } = await supabase
        .from('agent_logs')
        .select('*')
        .contains('payload', { agent: 'sara' })
        .order('created_at', { ascending: false })
        .limit(10)
      setLogs(data ?? [])
    } catch { }
  }

  async function triggerAction(endpoint: string, body: Record<string, unknown>) {
    setActiveAction(endpoint)
    setResult(null)
    setError('')
    try {
      const res  = await fetch(`${API_URL}/agents/sara/${endpoint}`, {
        method: 'POST', headers, body: JSON.stringify(body),
      })
      const data = await res.json()
      setResult(data)
      loadLogs()
    } catch (err: any) {
      setError(err.message ?? 'Erreur')
    } finally { setActiveAction(null) }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0F1117', color: '#E8EAEE', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ padding: '24px 32px 20px', borderBottom: '1px solid #2A3048', background: '#181C27', display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #2ECC71, #27AE60)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>⚙️</div>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 700 }}>Sara — Agent Ops</h1>
          <p style={{ fontSize: '12px', color: '#7A839A', marginTop: '2px' }}>Coordination · Onboarding · Automatisation via n8n</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0', minHeight: 'calc(100vh - 82px)' }}>

        {/* Panneau gauche — workflows */}
        <div style={{ width: '320px', flexShrink: 0, borderRight: '1px solid #2A3048', padding: '24px 20px', overflowY: 'auto' }}>
          <h2 style={{ fontSize: '12px', fontWeight: 600, color: '#7A839A', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '14px' }}>
            Workflows n8n
          </h2>

          {loadingWf ? (
            <div style={{ color: '#454D66', fontSize: '13px' }}>Chargement...</div>
          ) : workflows.map(wf => (
            <div key={wf.id} style={{ background: '#181C27', border: '1px solid #2A3048', borderRadius: '10px', padding: '14px', marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#E8EAEE' }}>{wf.name}</span>
                <a href={wf.n8n_url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '10px', color: '#2ECC71', textDecoration: 'none', flexShrink: 0 }}>
                  n8n →
                </a>
              </div>
              <p style={{ fontSize: '11px', color: '#7A839A', marginBottom: '8px', lineHeight: '1.5' }}>{wf.description}</p>
              <code style={{ fontSize: '10px', color: '#454D66', background: '#1E2336', padding: '2px 6px', borderRadius: '4px' }}>
                {wf.trigger}
              </code>
            </div>
          ))}

          {/* Logs récents */}
          <h2 style={{ fontSize: '12px', fontWeight: 600, color: '#7A839A', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '14px', marginTop: '24px' }}>
            Activité récente
          </h2>
          {logs.length === 0 ? (
            <div style={{ color: '#454D66', fontSize: '12px' }}>Aucune activité</div>
          ) : logs.map(log => (
            <div key={log.id} style={{ padding: '8px 12px', background: '#181C27', borderRadius: '8px', marginBottom: '6px', border: '1px solid #2A3048' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: (log.payload as any)?.success ? '#2ECC71' : '#E74C3C' }}>
                  {(log.payload as any)?.action ?? log.event_type}
                </span>
                <span style={{ fontSize: '10px', color: '#454D66', fontFamily: 'monospace' }}>{formatDate(log.created_at)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Panneau droit — actions */}
        <div style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>

          {result && (
            <div style={{
              padding: '12px 16px', borderRadius: '8px', marginBottom: '20px',
              background: result.success ? 'rgba(46,204,113,.1)' : 'rgba(231,76,60,.1)',
              border: `1px solid ${result.success ? 'rgba(46,204,113,.3)' : 'rgba(231,76,60,.3)'}`,
              fontSize: '13px', color: result.success ? '#2ECC71' : '#E74C3C',
            }}>
              {result.success
                ? `✓ ${result.action} déclenché avec succès`
                : `✗ Erreur : ${result.error}`}
            </div>
          )}

          {error && (
            <div style={{ padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', background: 'rgba(231,76,60,.1)', border: '1px solid rgba(231,76,60,.3)', fontSize: '13px', color: '#E74C3C' }}>
              {error}
            </div>
          )}

          {/* Action 1 — Escalade */}
          <div style={{ background: '#181C27', border: '1px solid #2A3048', borderRadius: '12px', padding: '20px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 600 }}>Escalader une session</h3>
                <p style={{ fontSize: '12px', color: '#7A839A' }}>Notifie l'opérateur par email via n8n</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
              <input
                type="text" placeholder="Session ID (UUID)" value={escalateSession}
                onChange={e => setEscalateSession(e.target.value)}
                style={{ flex: 1, background: '#1E2336', border: '1px solid #2A3048', borderRadius: '8px', padding: '8px 12px', color: '#E8EAEE', fontSize: '13px', outline: 'none', fontFamily: 'monospace' }}
              />
              <select value={escalatePriority} onChange={e => setEscalatePriority(e.target.value as any)}
                style={{ background: '#1E2336', border: '1px solid #2A3048', borderRadius: '8px', padding: '8px 12px', color: '#E8EAEE', fontSize: '13px', outline: 'none' }}>
                <option value="low">Basse</option>
                <option value="normal">Normale</option>
                <option value="high">Haute</option>
              </select>
            </div>
            <button
              onClick={() => triggerAction('escalate', { session_id: escalateSession, priority: escalatePriority })}
              disabled={!escalateSession || activeAction === 'escalate'}
              style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, background: '#E74C3C', color: '#fff', opacity: !escalateSession || activeAction === 'escalate' ? .5 : 1 }}>
              {activeAction === 'escalate' ? 'Envoi...' : 'Déclencher'}
            </button>
          </div>

          {/* Action 2 — Lead qualifié */}
          <div style={{ background: '#181C27', border: '1px solid #2A3048', borderRadius: '12px', padding: '20px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '20px' }}>🎯</span>
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 600 }}>Onboarding lead qualifié</h3>
                <p style={{ fontSize: '12px', color: '#7A839A' }}>Notifie l'équipe + confirme au prospect</p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
              <input type="text" placeholder="Lead ID (UUID)" value={leadId} onChange={e => setLeadId(e.target.value)}
                style={{ background: '#1E2336', border: '1px solid #2A3048', borderRadius: '8px', padding: '8px 12px', color: '#E8EAEE', fontSize: '13px', outline: 'none', fontFamily: 'monospace' }} />
              <input type="text" placeholder="Nom du prospect" value={leadName} onChange={e => setLeadName(e.target.value)}
                style={{ background: '#1E2336', border: '1px solid #2A3048', borderRadius: '8px', padding: '8px 12px', color: '#E8EAEE', fontSize: '13px', outline: 'none' }} />
              <input type="email" placeholder="Email du prospect" value={leadEmail} onChange={e => setLeadEmail(e.target.value)}
                style={{ background: '#1E2336', border: '1px solid #2A3048', borderRadius: '8px', padding: '8px 12px', color: '#E8EAEE', fontSize: '13px', outline: 'none' }} />
              <input type="text" placeholder="Projet (ex: Escalier chêne)" value={leadProject} onChange={e => setLeadProject(e.target.value)}
                style={{ background: '#1E2336', border: '1px solid #2A3048', borderRadius: '8px', padding: '8px 12px', color: '#E8EAEE', fontSize: '13px', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <label style={{ fontSize: '12px', color: '#7A839A' }}>Score :</label>
              <input type="range" min={0} max={100} value={leadScore} onChange={e => setLeadScore(Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ fontSize: '14px', fontWeight: 700, color: leadScore >= 70 ? '#2ECC71' : leadScore >= 50 ? '#F39C12' : '#E74C3C', minWidth: '40px' }}>{leadScore}</span>
            </div>
            <button
              onClick={() => triggerAction('lead-qualified', { lead_id: leadId, lead_name: leadName, lead_email: leadEmail, score: leadScore, project: leadProject })}
              disabled={!leadId || !leadName || activeAction === 'lead-qualified'}
              style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, background: '#2ECC71', color: '#0F1117', opacity: !leadId || !leadName || activeAction === 'lead-qualified' ? .5 : 1 }}>
              {activeAction === 'lead-qualified' ? 'Envoi...' : 'Déclencher'}
            </button>
          </div>

          {/* Action 3 — Relance */}
          <div style={{ background: '#181C27', border: '1px solid #2A3048', borderRadius: '12px', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '20px' }}>⏰</span>
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 600 }}>Relance lead inactif</h3>
                <p style={{ fontSize: '12px', color: '#7A839A' }}>Alerte l'équipe + relance automatique du prospect</p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
              <input type="text" placeholder="Lead ID (UUID)" value={leadId} onChange={e => setLeadId(e.target.value)}
                style={{ background: '#1E2336', border: '1px solid #2A3048', borderRadius: '8px', padding: '8px 12px', color: '#E8EAEE', fontSize: '13px', outline: 'none', fontFamily: 'monospace' }} />
              <input type="text" placeholder="Nom du prospect" value={leadName} onChange={e => setLeadName(e.target.value)}
                style={{ background: '#1E2336', border: '1px solid #2A3048', borderRadius: '8px', padding: '8px 12px', color: '#E8EAEE', fontSize: '13px', outline: 'none' }} />
              <input type="email" placeholder="Email du prospect" value={leadEmail} onChange={e => setLeadEmail(e.target.value)}
                style={{ background: '#1E2336', border: '1px solid #2A3048', borderRadius: '8px', padding: '8px 12px', color: '#E8EAEE', fontSize: '13px', outline: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '12px', color: '#7A839A', flexShrink: 0 }}>Jours inactif :</label>
                <input type="number" min={1} max={30} value={leadDaysIdle} onChange={e => setLeadDaysIdle(Number(e.target.value))}
                  style={{ flex: 1, background: '#1E2336', border: '1px solid #2A3048', borderRadius: '8px', padding: '8px 12px', color: '#E8EAEE', fontSize: '13px', outline: 'none' }} />
              </div>
            </div>
            <button
              onClick={() => triggerAction('lead-followup', { lead_id: leadId, lead_name: leadName, lead_email: leadEmail, days_idle: leadDaysIdle })}
              disabled={!leadId || !leadName || activeAction === 'lead-followup'}
              style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, background: '#F39C12', color: '#0F1117', opacity: !leadId || !leadName || activeAction === 'lead-followup' ? .5 : 1 }}>
              {activeAction === 'lead-followup' ? 'Envoi...' : 'Déclencher'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
